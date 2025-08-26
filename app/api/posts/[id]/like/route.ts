import { NextRequest, NextResponse } from 'next/server'

// 간단한 메모리 저장소 (실제로는 DB 사용)
const likeCounts = new Map<string, number>()

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const currentLikes = likeCounts.get(params.id) || 0
  likeCounts.set(params.id, currentLikes + 1)
  
  // 인위적인 지연 (DB 업데이트 시뮬레이션)
  await new Promise(resolve => setTimeout(resolve, Math.random() * 20))
  
  return NextResponse.json({
    success: true,
    data: { likes: currentLikes + 1 },
  })
}