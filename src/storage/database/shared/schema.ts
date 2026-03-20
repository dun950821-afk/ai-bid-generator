import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  timestamp,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// =====================================================
// 系统表（保留，禁止修改）
// =====================================================

export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// =====================================================
// 项目相关表
// =====================================================

/**
 * 项目表
 */
export const projects = pgTable(
  "projects",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    
    // 项目信息
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    projectNumber: varchar("project_number", { length: 100 }),
    
    // 关联知识库（百炼知识库ID）
    knowledgeBaseId: varchar("knowledge_base_id", { length: 36 }),
    
    // 状态
    status: varchar("status", { length: 20 }).default('draft'),
    // draft-草稿, processing-处理中, completed-已完成, submitted-已提交
    
    // 元数据
    metadata: jsonb("metadata"),
    createdBy: varchar("created_by", { length: 36 }),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("projects_status_idx").on(table.status),
    index("projects_created_by_idx").on(table.createdBy),
    index("projects_kb_idx").on(table.knowledgeBaseId),
  ]
);

/**
 * 评分项表
 */
export const scoringItems = pgTable(
  "scoring_items",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    
    // 评分项信息
    itemName: varchar("item_name", { length: 200 }).notNull(),
    itemCode: varchar("item_code", { length: 50 }),
    itemType: varchar("item_type", { length: 20 }).notNull(),
    // technical-技术评分, business-商务评分, price-价格评分
    
    parentItemId: varchar("parent_item_id", { length: 36 }),
    
    // 分值
    maxScore: integer("max_score").notNull(),
    weight: integer("weight"),
    
    // 评分细则
    scoringRules: jsonb("scoring_rules").default([]),
    
    // 响应状态
    responseStatus: varchar("response_status", { length: 20 }).default('pending'),
    // pending-待响应, responded-已响应, verified-已验证
    responseQuality: varchar("response_quality", { length: 20 }),
    // full-完整响应, partial-部分响应, none-未响应
    
    // 关联章节
    chapterId: varchar("chapter_id", { length: 36 }),
    
    // 元数据
    extractedFrom: text("extracted_from"),
    confidenceScore: integer("confidence_score"),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("scoring_items_project_idx").on(table.projectId),
    index("scoring_items_type_idx").on(table.itemType),
    index("scoring_items_parent_idx").on(table.parentItemId),
    index("scoring_items_status_idx").on(table.responseStatus),
  ]
);

/**
 * 废标风险表
 */
export const disqualificationRisks = pgTable(
  "disqualification_risks",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    projectId: varchar("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    
    // 风险信息
    riskType: varchar("risk_type", { length: 50 }).notNull(),
    // 否决条款, 资格要求, 格式要求, 保证金要求, 其他
    riskDescription: text("risk_description").notNull(),
    sourceText: text("source_text"),
    sourceLocation: text("source_location"),
    
    // 响应状态
    responseStatus: varchar("response_status", { length: 20 }).default('unresponded'),
    // unresponded-未响应, responded-已响应, verified-已验证
    responseContent: text("response_content"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedBy: varchar("responded_by", { length: 36 }),
    
    // 风险等级
    severity: varchar("severity", { length: 20 }).default('high'),
    // critical-致命, high-高, medium-中, low-低
    
    // 元数据
    extractedFrom: text("extracted_from"),
    confidenceScore: integer("confidence_score"),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("disqualification_risks_project_idx").on(table.projectId),
    index("disqualification_risks_type_idx").on(table.riskType),
    index("disqualification_risks_status_idx").on(table.responseStatus),
    index("disqualification_risks_severity_idx").on(table.severity),
  ]
);

// =====================================================
// TypeScript 类型导出
// =====================================================

export type Project = typeof projects.$inferSelect;
export type ScoringItem = typeof scoringItems.$inferSelect;
export type DisqualificationRisk = typeof disqualificationRisks.$inferSelect;
