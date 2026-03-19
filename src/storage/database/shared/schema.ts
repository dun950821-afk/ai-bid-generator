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
// 知识库相关表
// =====================================================

/**
 * 知识库表
 */
export const knowledgeBases = pgTable(
  "knowledge_bases",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    
    // 知识库类型：enterprise-企业知识库, project-项目知识库, public-公共知识库
    type: varchar("type", { length: 20 }).notNull().default('enterprise'),
    
    // 向量配置
    embeddingModel: varchar("embedding_model", { length: 100 }).default('text-embedding-ada-002'),
    chunkSize: integer("chunk_size").default(500),
    chunkOverlap: integer("chunk_overlap").default(50),
    
    // 统计信息
    documentCount: integer("document_count").default(0),
    chunkCount: integer("chunk_count").default(0),
    
    // 状态
    isActive: boolean("is_active").default(true).notNull(),
    
    // 元数据
    metadata: jsonb("metadata"),
    createdBy: varchar("created_by", { length: 36 }),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("knowledge_bases_type_idx").on(table.type),
    index("knowledge_bases_created_by_idx").on(table.createdBy),
    index("knowledge_bases_is_active_idx").on(table.isActive),
  ]
);

/**
 * 知识文档表
 */
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    knowledgeBaseId: varchar("knowledge_base_id", { length: 36 })
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    
    // 文档信息
    name: varchar("name", { length: 500 }).notNull(),
    originalName: varchar("original_name", { length: 500 }),
    fileType: varchar("file_type", { length: 255 }),  // 扩展到255，支持长MIME类型如docx
    fileSize: integer("file_size"),
    
    // 存储信息
    storagePath: varchar("storage_path", { length: 1000 }),
    storageType: varchar("storage_type", { length: 20 }).default('local'),
    
    // 向量化状态
    vectorStatus: varchar("vector_status", { length: 20 }).default('pending'),
    // pending-待处理, processing-处理中, completed-已完成, failed-失败
    vectorError: text("vector_error"),
    
    // 分块统计
    chunkCount: integer("chunk_count").default(0),
    
    // 元数据
    metadata: jsonb("metadata"),
    uploadedBy: varchar("uploaded_by", { length: 36 }),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("knowledge_documents_kb_idx").on(table.knowledgeBaseId),
    index("knowledge_documents_vector_status_idx").on(table.vectorStatus),
    index("knowledge_documents_uploaded_by_idx").on(table.uploadedBy),
  ]
);

/**
 * 文档分块表
 */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    documentId: varchar("document_id", { length: 36 })
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: 'cascade' }),
    knowledgeBaseId: varchar("knowledge_base_id", { length: 36 })
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: 'cascade' }),
    
    // 分块内容
    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    
    // 向量信息（存储在Qdrant，这里只存储向量ID）
    vectorId: varchar("vector_id", { length: 100 }),
    
    // 位置信息
    startPosition: integer("start_position"),
    endPosition: integer("end_position"),
    pageNumber: integer("page_number"),
    
    // 元数据
    metadata: jsonb("metadata"),
    
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("knowledge_chunks_doc_idx").on(table.documentId),
    index("knowledge_chunks_kb_idx").on(table.knowledgeBaseId),
    index("knowledge_chunks_vector_id_idx").on(table.vectorId),
  ]
);

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
    
    // 关联知识库
    knowledgeBaseId: varchar("knowledge_base_id", { length: 36 })
      .references(() => knowledgeBases.id, { onDelete: 'set null' }),
    
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

export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ScoringItem = typeof scoringItems.$inferSelect;
export type DisqualificationRisk = typeof disqualificationRisks.$inferSelect;
