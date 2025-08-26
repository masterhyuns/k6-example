import { NextRequest, NextResponse } from 'next/server'
import { Post, ApiResponse } from '@/types'

// 모의 데이터 (실제로는 DB에서 가져옴)
const posts: Map<string, Post> = new Map(
  Array.from({ length: 20 }, (_, i) => {
    const post: Post = {
      id: `post-${i + 1}`,
      title: `Performance Test Post ${i + 1}`,
      content: `Detailed content for post ${i + 1}. This is a longer text that simulates a real blog post content with multiple paragraphs and detailed information.`,
      authorId: `user-${(i % 5) + 1}`,
      views: Math.floor(Math.random() * 1000),
      likes: Math.floor(Math.random() * 100),
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    }
    return [post.id, post]
  })
)

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 인위적인 지연 (DB 쿼리 시뮬레이션)
  await new Promise(resolve => setTimeout(resolve, Math.random() * 30))
  
  const post = posts.get(params.id)
  
  if (!post) {
    return NextResponse.json(
      { success: false, error: 'Post not found' },
      { status: 404 }
    )
  }
  
  const response: ApiResponse<Post> = {
    success: true,
    data: post,
  }
  
  return NextResponse.json(response)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const post = posts.get(params.id)
    
    if (!post) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 }
      )
    }
    
    // 업데이트
    const updatedPost: Post = {
      ...post,
      title: body.title || post.title,
      content: body.content || post.content,
      updatedAt: new Date(),
    }
    
    posts.set(params.id, updatedPost)
    
    return NextResponse.json({
      success: true,
      data: updatedPost,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const deleted = posts.delete(params.id)
  
  if (!deleted) {
    return NextResponse.json(
      { success: false, error: 'Post not found' },
      { status: 404 }
    )
  }
  
  return NextResponse.json({
    success: true,
    data: { message: 'Post deleted successfully' },
  })
}