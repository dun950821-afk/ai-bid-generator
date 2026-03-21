/**
 * 章节锁定/解锁API
 * 支持多人协同编辑冲突控制
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 锁定持续时间（默认30分钟）
const LOCK_DURATION_MINUTES = 30;

// POST /api/projects/[id]/sections/[sectionId]/lock - 锁定章节
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const body = await req.json();
    const { userId, userName, forceLock = false } = body;

    if (!userId || !userName) {
      return NextResponse.json(
        { success: false, error: '缺少用户信息' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 检查章节是否存在
    const { data: existingSection } = await client
      .from('bid_sections')
      .select('id, is_locked, locked_by, locked_at, lock_expires_at')
      .eq('project_id', id)
      .eq('id', sectionId)
      .single();

    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + LOCK_DURATION_MINUTES * 60 * 1000);

    // 如果章节存在且已锁定
    if (existingSection?.is_locked && existingSection.lock_expires_at) {
      const lockExpiry = new Date(existingSection.lock_expires_at);
      
      // 检查锁是否过期
      if (lockExpiry > now) {
        // 锁未过期，检查是否是同一用户
        if (existingSection.locked_by === userId) {
          // 同一用户，延长锁定时间
          await client
            .from('bid_sections')
            .update({
              lock_expires_at: lockExpiresAt.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', sectionId);

          return NextResponse.json({
            success: true,
            message: '锁定时间已延长',
            data: {
              isLocked: true,
              lockedBy: userName,
              lockedAt: existingSection.locked_at,
              lockExpiresAt: lockExpiresAt.toISOString(),
            },
          });
        }

        // 不同用户，锁定冲突
        if (!forceLock) {
          return NextResponse.json(
            {
              success: false,
              error: `章节已被 ${existingSection.locked_by} 锁定中`,
              code: 'LOCK_CONFLICT',
              data: {
                isLocked: true,
                lockedBy: existingSection.locked_by,
                lockExpiresAt: existingSection.lock_expires_at,
              },
            },
            { status: 423 }
          );
        }

        // 强制锁定（管理员权限）
        console.log(`强制解锁章节 ${sectionId}，原锁定者: ${existingSection.locked_by}`);
      }
    }

    // 创建或更新锁定状态
    if (existingSection) {
      await client
        .from('bid_sections')
        .update({
          is_locked: true,
          locked_by: userName,
          locked_at: now.toISOString(),
          lock_expires_at: lockExpiresAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', sectionId);
    } else {
      // 创建新的章节记录
      await client
        .from('bid_sections')
        .insert({
          id: sectionId,
          project_id: id,
          title: sectionId,
          status: 'pending',
          is_locked: true,
          locked_by: userName,
          locked_at: now.toISOString(),
          lock_expires_at: lockExpiresAt.toISOString(),
        });
    }

    return NextResponse.json({
      success: true,
      message: '章节已锁定',
      data: {
        isLocked: true,
        lockedBy: userName,
        lockedAt: now.toISOString(),
        lockExpiresAt: lockExpiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('锁定章节失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '锁定失败' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/sections/[sectionId]/lock - 解锁章节
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const userName = searchParams.get('userName');
    const forceUnlock = searchParams.get('forceUnlock') === 'true';

    const client = getSupabaseClient();

    // 检查章节状态
    const { data: section } = await client
      .from('bid_sections')
      .select('id, is_locked, locked_by')
      .eq('project_id', id)
      .eq('id', sectionId)
      .single();

    if (!section) {
      return NextResponse.json(
        { success: false, error: '章节不存在' },
        { status: 404 }
      );
    }

    if (!section.is_locked) {
      return NextResponse.json({
        success: true,
        message: '章节未锁定',
      });
    }

    // 权限检查：只有锁定者或管理员可以解锁
    // 支持 userId 或 userName 匹配
    const isLockOwner = (userId && section.locked_by === userId) || 
                        (userName && section.locked_by === userName);
    
    if (!isLockOwner && !forceUnlock) {
      return NextResponse.json(
        {
          success: false,
          error: '只能由锁定者解锁',
          code: 'UNAUTHORIZED',
        },
        { status: 403 }
      );
    }

    // 解锁
    await client
      .from('bid_sections')
      .update({
        is_locked: false,
        locked_by: null,
        locked_at: null,
        lock_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sectionId);

    return NextResponse.json({
      success: true,
      message: '章节已解锁',
    });
  } catch (error) {
    console.error('解锁章节失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '解锁失败' },
      { status: 500 }
    );
  }
}

// GET /api/projects/[id]/sections/[sectionId]/lock - 获取锁定状态
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id, sectionId } = await params;
    const client = getSupabaseClient();

    const { data: section } = await client
      .from('bid_sections')
      .select('id, is_locked, locked_by, locked_at, lock_expires_at')
      .eq('project_id', id)
      .eq('id', sectionId)
      .single();

    if (!section) {
      return NextResponse.json({
        success: true,
        data: {
          isLocked: false,
          lockedBy: null,
          lockedAt: null,
          lockExpiresAt: null,
        },
      });
    }

    // 检查锁是否过期
    if (section.is_locked && section.lock_expires_at) {
      const lockExpiry = new Date(section.lock_expires_at);
      if (lockExpiry < new Date()) {
        // 锁已过期，自动解锁
        await client
          .from('bid_sections')
          .update({
            is_locked: false,
            locked_by: null,
            locked_at: null,
            lock_expires_at: null,
          })
          .eq('id', sectionId);

        return NextResponse.json({
          success: true,
          data: {
            isLocked: false,
            lockedBy: null,
            lockedAt: null,
            lockExpiresAt: null,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        isLocked: section.is_locked || false,
        lockedBy: section.locked_by,
        lockedAt: section.locked_at,
        lockExpiresAt: section.lock_expires_at,
      },
    });
  } catch (error) {
    console.error('获取锁定状态失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取状态失败' },
      { status: 500 }
    );
  }
}
