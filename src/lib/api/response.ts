/**
 * 统一API响应格式
 * @description 提供一致的API响应结构，便于前后端对接
 */

import { NextResponse } from 'next/server';

/**
 * 成功响应数据结构
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
  requestId?: string;
}

/**
 * 错误响应数据结构
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
  requestId?: string;
}

/**
 * 分页响应数据结构
 */
export interface PaginatedResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * API响应工具类
 */
export class ApiResponse {
  /**
   * 成功响应
   */
  static success<T>(data: T, message?: string, requestId?: string): NextResponse<SuccessResponse<T>> {
    return NextResponse.json({
      success: true,
      data,
      message,
      requestId,
    } as SuccessResponse<T>);
  }

  /**
   * 错误响应
   */
  static error(
    message: string,
    code?: string,
    status: number = 500,
    details?: any,
    requestId?: string
  ): NextResponse<ErrorResponse> {
    return NextResponse.json(
      {
        success: false,
        error: { message, code, details },
        requestId,
      } as ErrorResponse,
      { status }
    );
  }

  /**
   * 分页响应
   */
  static paginated<T>(
    items: T[],
    total: number,
    page: number,
    pageSize: number,
    requestId?: string
  ): NextResponse<SuccessResponse<PaginatedResponse<T>>> {
    return NextResponse.json({
      success: true,
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      requestId,
    } as SuccessResponse<PaginatedResponse<T>>);
  }

  /**
   * 参数错误响应
   */
  static badRequest(message: string, details?: any): NextResponse<ErrorResponse> {
    return this.error(message, 'BAD_REQUEST', 400, details);
  }

  /**
   * 未找到响应
   */
  static notFound(message: string = '资源不存在'): NextResponse<ErrorResponse> {
    return this.error(message, 'NOT_FOUND', 404);
  }

  /**
   * 未授权响应
   */
  static unauthorized(message: string = '未授权访问'): NextResponse<ErrorResponse> {
    return this.error(message, 'UNAUTHORIZED', 401);
  }

  /**
   * 禁止访问响应
   */
  static forbidden(message: string = '禁止访问'): NextResponse<ErrorResponse> {
    return this.error(message, 'FORBIDDEN', 403);
  }

  /**
   * 冲突响应
   */
  static conflict(message: string, details?: any): NextResponse<ErrorResponse> {
    return this.error(message, 'CONFLICT', 409, details);
  }

  /**
   * 服务不可用响应
   */
  static serviceUnavailable(message: string = '服务暂时不可用'): NextResponse<ErrorResponse> {
    return this.error(message, 'SERVICE_UNAVAILABLE', 503);
  }
}

/**
 * 错误代码枚举
 */
export enum ErrorCode {
  // 通用错误
  UNKNOWN = 'UNKNOWN',
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  
  // 业务错误
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  SECTION_NOT_FOUND = 'SECTION_NOT_FOUND',
  KNOWLEDGE_BASE_NOT_FOUND = 'KNOWLEDGE_BASE_NOT_FOUND',
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  
  // 配置错误
  CONFIG_MISSING = 'CONFIG_MISSING',
  BAILIAN_NOT_CONFIGURED = 'BAILIAN_NOT_CONFIGURED',
  LLM_NOT_CONFIGURED = 'LLM_NOT_CONFIGURED',
  
  // 操作错误
  SECTION_LOCKED = 'SECTION_LOCKED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  GENERATION_FAILED = 'GENERATION_FAILED',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  
  // 服务错误
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
}

/**
 * 业务异常类
 */
export class BusinessException extends Error {
  constructor(
    message: string,
    public code: ErrorCode = ErrorCode.UNKNOWN,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'BusinessException';
  }

  /**
   * 转换为API响应
   */
  toResponse(): NextResponse<ErrorResponse> {
    return ApiResponse.error(this.message, this.code, this.statusCode, this.details);
  }
}

/**
 * 创建业务异常的便捷方法
 */
export const createError = {
  notFound: (message: string) => new BusinessException(message, ErrorCode.NOT_FOUND, 404),
  badRequest: (message: string, details?: any) => new BusinessException(message, ErrorCode.BAD_REQUEST, 400, details),
  unauthorized: (message: string) => new BusinessException(message, ErrorCode.UNAUTHORIZED, 401),
  forbidden: (message: string) => new BusinessException(message, ErrorCode.FORBIDDEN, 403),
  conflict: (message: string, details?: any) => new BusinessException(message, ErrorCode.CONFLICT, 409, details),
  configMissing: (message: string) => new BusinessException(message, ErrorCode.CONFIG_MISSING, 400),
  sectionLocked: (message: string, details?: any) => new BusinessException(message, ErrorCode.SECTION_LOCKED, 423, details),
  serviceUnavailable: (message: string) => new BusinessException(message, ErrorCode.SERVICE_UNAVAILABLE, 503),
};
