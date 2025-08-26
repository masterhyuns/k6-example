import { NextRequest, NextResponse } from 'next/server'

// 간단한 메모리 저장소 (실제로는 DB 사용)
const viewCounts = new Map<string, number>()

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const currentViews = viewCounts.get(params.id) || 0
  viewCounts.set(params.id, currentViews + 1)
  
  // 인위적인 지연 (DB 업데이트 시뮬레이션)
  await new Promise(resolve => setTimeout(resolve, Math.random() * 20))
  
  return NextResponse.json({
    success: true,
    data: { views: currentViews + 1 },
  })
}