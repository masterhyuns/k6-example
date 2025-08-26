'use client'

import { useState, useEffect } from 'react'
import { Post, User } from '@/types'

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<string | null>(null)

  useEffect(() => {
    fetchInitialData()
  }, [])

  const fetchInitialData = async () => {
    try {
      const [postsRes, usersRes] = await Promise.all([
        fetch('/api/posts'),
        fetch('/api/users')
      ])
      
      const postsData = await postsRes.json()
      const usersData = await usersRes.json()
      
      if (postsData.success) setPosts(postsData.data)
      if (usersData.success) setUsers(usersData.data)
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePostClick = async (postId: string) => {
    setSelectedPost(postId)
    
    // 조회수 증가 API 호출
    await fetch(`/api/posts/${postId}/view`, { method: 'POST' })
    
    // 게시물 상세 조회
    const res = await fetch(`/api/posts/${postId}`)
    const data = await res.json()
    
    if (data.success) {
      setPosts(prev => prev.map(p => p.id === postId ? data.data : p))
    }
  }

  const handleLike = async (postId: string) => {
    const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' })
    const data = await res.json()
    
    if (data.success) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + 1 } : p))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-8">Performance Test App</h1>
      
      <div className="grid md:grid-cols-2 gap-8">
        <section>
          <h2 className="text-2xl font-semibold mb-4">Posts ({posts.length})</h2>
          <div className="space-y-4">
            {posts.map(post => (
              <div 
                key={post.id}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedPost === post.id ? 'bg-blue-50 border-blue-500' : 'hover:bg-gray-50'
                }`}
                onClick={() => handlePostClick(post.id)}
              >
                <h3 className="text-lg font-medium">{post.title}</h3>
                <p className="text-gray-600 mt-2">{post.content.substring(0, 100)}...</p>
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-gray-500">
                    Views: {post.views} | Likes: {post.likes}
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation()
                      handleLike(post.id)
                    }}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Like
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        
        <section>
          <h2 className="text-2xl font-semibold mb-4">Users ({users.length})</h2>
          <div className="space-y-3">
            {users.map(user => (
              <div key={user.id} className="p-3 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <img 
                    src={user.avatar} 
                    alt={user.name}
                    className="w-10 h-10 rounded-full bg-gray-200"
                  />
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      
      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-gray-600">API Response Time</p>
            <p className="text-2xl font-bold">~50ms</p>
          </div>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-gray-600">Page Load Time</p>
            <p className="text-2xl font-bold">~200ms</p>
          </div>
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-sm text-gray-600">Active Users</p>
            <p className="text-2xl font-bold">{users.length}</p>
          </div>
        </div>
      </section>
    </main>
  )
}