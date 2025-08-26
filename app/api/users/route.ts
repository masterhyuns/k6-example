import { NextRequest, NextResponse } from 'next/server'
import { User, ApiResponse } from '@/types'

// 모의 사용자 데이터 생성
const generateUsers = (count: number = 10): User[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `user-${i + 1}`,
    name: `Test User ${i + 1}`,
    email: `user${i + 1}@example.com`,
    avatar: `https://i.pravatar.cc/150?img=${i + 1}`,
    createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
  }))
}

const users = generateUsers(10)

export async function GET(request: NextRequest) {
  // 인위적인 지연 (DB 쿼리 시뮬레이션)
  await new Promise(resolve => setTimeout(resolve, Math.random() * 40))
  
  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search')
  
  let filteredUsers = users
  
  if (search) {
    filteredUsers = users.filter(user => 
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())
    )
  }
  
  const response: ApiResponse<User[]> = {
    success: true,
    data: filteredUsers,
  }
  
  return NextResponse.json(response)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // 유효성 검사
    if (!body.name || !body.email) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // 이메일 중복 체크
    if (users.some(u => u.email === body.email)) {
      return NextResponse.json(
        { success: false, error: 'Email already exists' },
        { status: 409 }
      )
    }
    
    // 새 사용자 생성
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: body.name,
      email: body.email,
      avatar: body.avatar || `https://i.pravatar.cc/150?img=${Date.now()}`,
      createdAt: new Date(),
    }
    
    users.push(newUser)
    
    return NextResponse.json(
      { success: true, data: newUser },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  }
}