import { NextRequest, NextResponse } from 'next/server'
import { Post, ApiResponse } from '@/types'

// 모의 데이터 생성
const generatePosts = (count: number = 10): Post[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `post-${i + 1}`,
    title: `Performance Test Post ${i + 1}`,
    content: `This is a sample post content for performance testing. It contains enough text to simulate a real blog post. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
    authorId: `user-${(i % 5) + 1}`,
    views: Math.floor(Math.random() * 1000),
    likes: Math.floor(Math.random() * 100),
    createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  }))
}

const posts = generatePosts(20)

export async function GET(request: NextRequest) {
  // 쿼리 파라미터 처리
  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '10')
  const sortBy = searchParams.get('sortBy') || 'createdAt'
  
  // 인위적인 지연 추가 (실제 DB 쿼리 시뮬레이션)
  await new Promise(resolve => setTimeout(resolve, Math.random() * 50))
  
  // 정렬
  const sortedPosts = [...posts].sort((a, b) => {
    if (sortBy === 'views') return b.views - a.views
    if (sortBy === 'likes') return b.likes - a.likes
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
  
  // 페이지네이션
  const start = (page - 1) * pageSize
  const paginatedPosts = sortedPosts.slice(start, start + pageSize)
  
  const response: ApiResponse<Post[]> = {
    success: true,
    data: paginatedPosts,
    meta: {
      total: posts.length,
      page,
      pageSize,
      totalPages: Math.ceil(posts.length / pageSize),
    }
  }
  
  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=60',
    }
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // 유효성 검사
    if (!body.title || !body.content || !body.authorId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // 새 게시물 생성
    const newPost: Post = {
      id: `post-${Date.now()}`,
      title: body.title,
      content: body.content,
      authorId: body.authorId,
      views: 0,
      likes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    
    posts.push(newPost)
    
    return NextResponse.json(
      { success: true, data: newPost },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  }
}