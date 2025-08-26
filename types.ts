/**
 * 사용자 정보 타입
 * @interface User
 * @property {string} id - 사용자 고유 식별자
 * @property {string} name - 사용자 이름
 * @property {string} email - 사용자 이메일 주소
 * @property {string} avatar - 사용자 아바타 이미지 URL
 * @property {Date} createdAt - 계정 생성일시
 */
export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  createdAt: Date;
}

/**
 * 게시물 정보 타입
 * @interface Post
 * @property {string} id - 게시물 고유 식별자
 * @property {string} title - 게시물 제목
 * @property {string} content - 게시물 내용
 * @property {string} authorId - 작성자 ID (User.id 참조)
 * @property {number} views - 조회수
 * @property {number} likes - 좋아요 수
 * @property {Date} createdAt - 게시물 생성일시
 * @property {Date} updatedAt - 게시물 수정일시
 */
export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  views: number;
  likes: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 댓글 정보 타입
 * @interface Comment
 * @property {string} id - 댓글 고유 식별자
 * @property {string} postId - 게시물 ID (Post.id 참조)
 * @property {string} authorId - 작성자 ID (User.id 참조)
 * @property {string} content - 댓글 내용
 * @property {Date} createdAt - 댓글 생성일시
 */
export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

/**
 * API 응답 래퍼 타입
 * @interface ApiResponse
 * @template T - 응답 데이터 타입
 * @property {boolean} success - 요청 성공 여부
 * @property {T} [data] - 응답 데이터 (성공 시)
 * @property {string} [error] - 에러 메시지 (실패 시)
 * @property {ApiResponseMeta} [meta] - 메타 정보 (페이지네이션 등)
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: ApiResponseMeta;
}

/**
 * API 응답 메타 정보
 * @interface ApiResponseMeta
 * @property {number} [total] - 전체 항목 수
 * @property {number} [page] - 현재 페이지 번호
 * @property {number} [pageSize] - 페이지당 항목 수
 * @property {number} [totalPages] - 전체 페이지 수
 */
export interface ApiResponseMeta {
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

/**
 * 성능 메트릭 타입
 * @interface PerformanceMetric
 * @property {string} endpoint - API 엔드포인트
 * @property {number} responseTime - 응답 시간 (ms)
 * @property {number} statusCode - HTTP 상태 코드
 * @property {Date} timestamp - 측정 시각
 * @property {string} [error] - 에러 메시지 (에러 발생 시)
 */
export interface PerformanceMetric {
  endpoint: string;
  responseTime: number;
  statusCode: number;
  timestamp: Date;
  error?: string;
}