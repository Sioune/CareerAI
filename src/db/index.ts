import { supabase } from "../lib/supabase.ts";
import fs from "fs";
import path from "path";
import { users, resumeVersions, rewriteSuggestions, clarificationQuestions, userFeedbacks, eventLogs } from "./schema.ts";

// Local File Database setup as fallback/resilient cache
const localDbPath = path.join(process.cwd(), "local-db.json");

function initLocalDb() {
  if (!fs.existsSync(localDbPath)) {
    const initial = {
      users: [],
      resume_versions: [],
      rewrite_suggestions: [],
      clarification_questions: [],
      user_feedbacks: [],
      event_logs: []
    };
    fs.writeFileSync(localDbPath, JSON.stringify(initial, null, 2), "utf8");
  }
}
initLocalDb();

function readLocalDb(): Record<string, any[]> {
  try {
    if (fs.existsSync(localDbPath)) {
      const content = fs.readFileSync(localDbPath, "utf8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Failed to read local DB:", err);
  }
  return {
    users: [],
    resume_versions: [],
    rewrite_suggestions: [],
    clarification_questions: [],
    user_feedbacks: [],
    event_logs: []
  };
}

function writeLocalDb(data: Record<string, any[]>) {
  try {
    fs.writeFileSync(localDbPath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write local DB:", err);
  }
}

// Table Map
const tableMap = new Map<any, string>([
  [users, "users"],
  [resumeVersions, "resume_versions"],
  [rewriteSuggestions, "rewrite_suggestions"],
  [clarificationQuestions, "clarification_questions"],
  [userFeedbacks, "user_feedbacks"],
  [eventLogs, "event_logs"]
]);

// Field Mappings (JS CamelCase <=> Postgres SnakeCase)
const fieldToDbCol: Record<string, string> = {
  id: 'id',
  uid: 'uid',
  email: 'email',
  userId: 'user_id',
  reportId: 'report_id',
  versions: 'versions',
  suggestions: 'suggestions',
  questions: 'questions',
  rating: 'rating',
  feedbackText: 'feedback_text',
  eventType: 'event_type',
  metaData: 'meta_data',
  createdAt: 'created_at',
};

const dbColToField: Record<string, string> = {
  id: 'id',
  uid: 'uid',
  email: 'email',
  user_id: 'userId',
  report_id: 'reportId',
  versions: 'versions',
  suggestions: 'suggestions',
  questions: 'questions',
  rating: 'rating',
  feedback_text: 'feedbackText',
  event_type: 'eventType',
  meta_data: 'metaData',
  created_at: 'createdAt',
};

function toDbRow(jsObj: Record<string, any>): Record<string, any> {
  const dbRow: Record<string, any> = {};
  for (const [k, v] of Object.entries(jsObj)) {
    const dbCol = fieldToDbCol[k] || k;
    dbRow[dbCol] = v;
  }
  return dbRow;
}

function toJsObject(dbRow: Record<string, any>): Record<string, any> {
  const jsObj: Record<string, any> = {};
  for (const [k, v] of Object.entries(dbRow || {})) {
    const field = dbColToField[k] || k;
    jsObj[field] = v;
  }
  return jsObj;
}

function getFieldName(fieldObj: any): string {
  if (!fieldObj) return "";
  if (typeof fieldObj === "string") return fieldObj;
  
  const dbName = fieldObj.name;
  if (dbName === "user_id") return "userId";
  if (dbName === "report_id") return "reportId";
  if (dbName === "feedback_text") return "feedbackText";
  if (dbName === "event_type") return "eventType";
  if (dbName === "meta_data") return "metaData";
  if (dbName === "created_at") return "createdAt";
  if (dbName) return dbName;
  
  return String(fieldObj);
}

function getDbColumnName(fieldObj: any): string {
  if (!fieldObj) return "";
  if (typeof fieldObj === "string") {
    return fieldToDbCol[fieldObj] || fieldObj;
  }
  if (fieldObj.name) {
    return fieldObj.name;
  }
  return String(fieldObj);
}

// Recursive condition matching for local DB fallback
function matchCondition(item: any, condition: any): boolean {
  if (!condition) return true;
  
  if (condition.type === "eq") {
    const field = getFieldName(condition.field);
    const itemVal = item[field];
    return String(itemVal) === String(condition.value);
  }
  
  if (condition.type === "and") {
    for (const cond of condition.conditions) {
      if (!matchCondition(item, cond)) {
        return false;
      }
    }
    return true;
  }
  
  return true;
}

// Recursive condition building for Supabase / Postgrest
function applyConditionToSupabase(query: any, condition: any): any {
  if (!condition) return query;
  
  if (condition.type === "eq") {
    const colName = getDbColumnName(condition.field);
    return query.eq(colName, condition.value);
  }
  
  if (condition.type === "and") {
    let currentQuery = query;
    for (const cond of condition.conditions) {
      currentQuery = applyConditionToSupabase(currentQuery, cond);
    }
    return currentQuery;
  }
  
  return query;
}

// Supabase helper functions with local DB cache/fallback
const isPlaceholder = !process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL.includes("placeholder-project");

async function runSelect(colName: string, selectFields: any, condition: any): Promise<any[]> {
  try {
    let query = supabase.from(colName).select('*');
    if (condition) {
      query = applyConditionToSupabase(query, condition);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    if (data) {
      return data.map(toJsObject);
    }
  } catch (err: any) {
    console.error(`[Database Error] Supabase select on "${colName}" failed. Error: ${err.message || err}`);
    if (!isPlaceholder) {
      throw err;
    }
  }

  // Local fallback ONLY if placeholder is used
  const dbData = readLocalDb();
  const items = dbData[colName] || [];
  return items.filter(item => matchCondition(item, condition));
}

async function runInsert(colName: string, data: any): Promise<any[]> {
  const mappedData = toJsObject(toDbRow(data));
  if (!mappedData.createdAt) {
    mappedData.createdAt = new Date().toISOString();
  }

  try {
    const dbRow = toDbRow(mappedData);
    if (dbRow.id === undefined || dbRow.id === null) {
      delete dbRow.id;
    }

    const { data: inserted, error } = await supabase.from(colName).insert(dbRow).select();
    if (error) {
      throw error;
    }
    if (inserted && inserted.length > 0) {
      return inserted.map(toJsObject);
    }
  } catch (err: any) {
    console.error(`[Database Error] Supabase insert on "${colName}" failed. Error: ${err.message || err}`);
    if (!isPlaceholder) {
      throw err;
    }
  }

  // Local fallback ONLY if placeholder is used
  const dbData = readLocalDb();
  if (!dbData[colName]) {
    dbData[colName] = [];
  }
  
  if (mappedData.id === undefined || mappedData.id === null) {
    if (colName === "users" && mappedData.uid) {
      mappedData.id = mappedData.uid;
    } else {
      mappedData.id = Math.floor(Math.random() * 1000000);
    }
  }

  // Prevent duplicates for users or key structures
  if (colName === "users" && mappedData.uid) {
    dbData[colName] = dbData[colName].filter((x: any) => x.uid !== mappedData.uid);
  } else if ((colName === "resume_versions" || colName === "rewrite_suggestions" || colName === "clarification_questions") && mappedData.userId && mappedData.reportId) {
    dbData[colName] = dbData[colName].filter((x: any) => !(x.userId === mappedData.userId && x.reportId === mappedData.reportId));
  }

  dbData[colName].push(mappedData);
  writeLocalDb(dbData);
  return [mappedData];
}

async function runUpdate(colName: string, updateFields: any, condition: any): Promise<{ success: boolean }> {
  const dbUpdate = toDbRow(updateFields);

  try {
    let query = supabase.from(colName).update(dbUpdate);
    if (condition) {
      query = applyConditionToSupabase(query, condition);
    }
    const { error } = await query;
    if (error) {
      throw error;
    }
    return { success: true };
  } catch (err: any) {
    console.error(`[Database Error] Supabase update on "${colName}" failed. Error: ${err.message || err}`);
    if (!isPlaceholder) {
      throw err;
    }
  }

  // Local fallback ONLY if placeholder is used
  const dbData = readLocalDb();
  const items = dbData[colName] || [];
  let updatedCount = 0;
  for (const item of items) {
    if (matchCondition(item, condition)) {
      Object.assign(item, updateFields);
      updatedCount++;
    }
  }
  if (updatedCount > 0) {
    writeLocalDb(dbData);
  }
  return { success: true };
}

async function runDelete(colName: string, condition: any): Promise<{ success: boolean }> {
  try {
    let query = supabase.from(colName).delete();
    if (condition) {
      query = applyConditionToSupabase(query, condition);
    }
    const { error } = await query;
    if (error) {
      throw error;
    }
    return { success: true };
  } catch (err: any) {
    console.error(`[Database Error] Supabase delete on "${colName}" failed. Error: ${err.message || err}`);
    if (!isPlaceholder) {
      throw err;
    }
  }

  // Local fallback ONLY if placeholder is used
  const dbData = readLocalDb();
  const items = dbData[colName] || [];
  const initialLength = items.length;
  dbData[colName] = items.filter(item => !matchCondition(item, condition));
  if (dbData[colName].length !== initialLength) {
    writeLocalDb(dbData);
  }
  return { success: true };
}

// Promise-compatible builder objects
function createSelectPromise(table: any, selectFields: any, condition: any = null): Promise<any> & { from: (table: any) => any; where: (condition: any) => any } {
  const promise = (async () => {
    const colName = tableMap.get(table) || "unknown";
    const results = await runSelect(colName, selectFields, condition);

    if (selectFields) {
      return results.map((r: any) => {
        const mapped: any = {};
        for (const key of Object.keys(selectFields)) {
          const col = selectFields[key];
          const colName = getDbColumnName(col);
          const fieldKey = dbColToField[colName] || colName;
          mapped[key] = r[fieldKey];
        }
        return mapped;
      });
    }

    return results;
  })();

  const extendedPromise = promise as any;
  extendedPromise.from = (newTable: any) => createSelectPromise(newTable, selectFields, condition);
  extendedPromise.where = (newCondition: any) => createSelectPromise(table, selectFields, newCondition);

  return extendedPromise;
}

function createInsertPromise(table: any, data: any): Promise<any> & { values: (data: any) => any; returning: () => any } {
  const promise = (async () => {
    const colName = tableMap.get(table) || "unknown";
    return runInsert(colName, data);
  })();

  const extendedPromise = promise as any;
  extendedPromise.values = (newData: any) => createInsertPromise(table, newData);
  extendedPromise.returning = () => extendedPromise;

  return extendedPromise;
}

function createUpdatePromise(table: any, data: any, condition: any = null): Promise<any> & { where: (condition: any) => any } {
  const promise = (async () => {
    const colName = tableMap.get(table) || "unknown";
    return runUpdate(colName, data, condition);
  })();

  const extendedPromise = promise as any;
  extendedPromise.where = (newCondition: any) => createUpdatePromise(table, data, newCondition);

  return extendedPromise;
}

function createDeletePromise(table: any, condition: any = null): Promise<any> & { where: (condition: any) => any } {
  const promise = (async () => {
    const colName = tableMap.get(table) || "unknown";
    return runDelete(colName, condition);
  })();

  const extendedPromise = promise as any;
  extendedPromise.where = (newCondition: any) => createDeletePromise(table, newCondition);

  return extendedPromise;
}

// Wrapper DB client matching original Drizzle signature
export const db = {
  select: (fields?: any) => {
    return {
      from: (table: any) => {
        return createSelectPromise(table, fields);
      }
    };
  },
  insert: (table: any) => {
    return {
      values: (data: any) => {
        return createInsertPromise(table, data);
      }
    };
  },
  update: (table: any) => {
    return {
      set: (data: any) => {
        return {
          where: (condition: any) => {
            return createUpdatePromise(table, data, condition);
          }
        };
      }
    };
  },
  delete: (table: any) => {
    return {
      where: (condition: any) => {
        return createDeletePromise(table, condition);
      }
    };
  }
};

// Query operators
export function eq(fieldObj: any, value: any) {
  return { type: "eq", field: fieldObj, value };
}

export function and(...conditions: any[]) {
  return { type: "and", conditions };
}
