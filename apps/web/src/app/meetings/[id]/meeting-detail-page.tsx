'use client'

import { Button, Card, ProgressBar, Spinner } from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { API_URL, formatDate } from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

// Держать в синхроне с лимитом fileSize в apps/api/src/main.ts
const MAX_FILE_SIZE_MB = 100
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

interface Meeting {
  id: string
  title: string
  date: string
  participants: string[]
}

interface MeetingFile {
  id: string
  originalName: string
  mimeType: string
  size: number
  uploadedAt: string
}

function BackIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  )
}

function FileIconBase({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const FILE_TYPE_SHAPES: Array<{ match: (mimeType: string) => boolean; shape: ReactNode }> = [
  {
    match: (m) => m.startsWith('video/'),
    shape: (
      <>
        <rect x="2" y="5" width="14" height="14" rx="2" />
        <path d="M16 10l6-3v10l-6-3" />
      </>
    ),
  },
  {
    match: (m) => m.startsWith('audio/'),
    shape: (
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    ),
  },
  {
    match: (m) => m.includes('spreadsheet'),
    shape: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
        <path d="M9 3v18" />
      </>
    ),
  },
  {
    match: (m) => m.includes('presentation'),
    shape: (
      <>
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21l4-4 4 4" />
      </>
    ),
  },
  {
    match: (m) => m === 'application/pdf' || m.startsWith('text/') || m.includes('wordprocessing'),
    shape: (
      <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </>
    ),
  },
]

const GENERIC_FILE_SHAPE = (
  <>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
  </>
)

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  const shape = FILE_TYPE_SHAPES.find(({ match }) => match(mimeType))?.shape ?? GENERIC_FILE_SHAPE
  return <FileIconBase>{shape}</FileIconBase>
}

function describeUploadError(xhr: XMLHttpRequest): string {
  let code = ''
  try {
    code = JSON.parse(xhr.responseText)?.code ?? ''
  } catch {
    // ответ не JSON — используем сообщение по умолчанию
  }

  if (code === 'FILE_TOO_LARGE') {
    return `Файл слишком большой — максимальный размер ${MAX_FILE_SIZE_MB} МБ`
  }
  if (code === 'FILE_TYPE_NOT_ALLOWED') {
    return 'Недопустимый тип файла. Разрешены: видео, аудио, PDF, DOCX, XLSX, PPTX, TXT'
  }
  return 'Не удалось загрузить файл'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

function FileRow({
  file,
  isDeleting,
  onDownload,
  onDelete,
}: {
  file: MeetingFile
  isDeleting: boolean
  onDownload: (file: MeetingFile) => void
  onDelete: (file: MeetingFile) => void
}) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{ background: 'color-mix(in oklch, var(--foreground) 5%, transparent)' }}
    >
      <span style={{ color: 'var(--muted)' }}>
        <FileTypeIcon mimeType={file.mimeType} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate" style={{ color: 'var(--foreground)' }}>
          {file.originalName}
        </p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {formatFileSize(file.size)} · {formatDate(file.uploadedAt)}
        </p>
      </div>
      <Button
        variant="ghost"
        isIconOnly
        aria-label={`Скачать ${file.originalName}`}
        onPress={() => onDownload(file)}
      >
        <DownloadIcon />
      </Button>
      <Button
        variant="danger-soft"
        isIconOnly
        isDisabled={isDeleting}
        aria-label={`Удалить ${file.originalName}`}
        onPress={() => onDelete(file)}
      >
        {isDeleting ? <Spinner size="sm" /> : <TrashIcon />}
      </Button>
    </div>
  )
}

function UploadZone({
  isUploading,
  uploadProgress,
  onSelectFile,
}: {
  isUploading: boolean
  uploadProgress: number
  onSelectFile: (file: File) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    if (isUploading) return
    const file = e.dataTransfer.files[0]
    if (file) onSelectFile(file)
  }

  return (
    <div
      role="button"
      tabIndex={isUploading ? -1 : 0}
      aria-label="Загрузить файл"
      aria-disabled={isUploading}
      onClick={() => !isUploading && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
          e.preventDefault()
          inputRef.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!isUploading) setIsDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false)
      }}
      onDrop={handleDrop}
      className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 px-4 py-8 text-center transition-colors"
      style={{
        cursor: isUploading ? 'default' : 'pointer',
        borderColor: isDragging
          ? 'var(--accent)'
          : 'color-mix(in oklch, var(--foreground) 20%, transparent)',
        background: isDragging
          ? 'color-mix(in oklch, var(--accent) 8%, transparent)'
          : 'transparent',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        disabled={isUploading}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onSelectFile(file)
          e.target.value = ''
        }}
      />
      {isUploading ? (
        <div className="w-full max-w-xs flex flex-col items-center gap-2">
          <ProgressBar aria-label="Загрузка файла" value={uploadProgress} className="w-full">
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Загрузка… {uploadProgress}%
          </p>
        </div>
      ) : (
        <>
          <span style={{ color: 'var(--muted)' }}>
            <UploadIcon />
          </span>
          <p className="text-sm" style={{ color: 'var(--foreground)' }}>
            Перетащите файл сюда или нажмите, чтобы выбрать
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            До {MAX_FILE_SIZE_MB} МБ · видео, аудио, PDF, DOCX, XLSX, PPTX, TXT
          </p>
        </>
      )}
    </div>
  )
}

export function MeetingDetailPage({ meetingId }: { meetingId: string }) {
  const router = useRouter()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [files, setFiles] = useState<MeetingFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const activeUploadRef = useRef<XMLHttpRequest | null>(null)

  useEffect(() => {
    return () => activeUploadRef.current?.abort()
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      router.replace('/login')
      return
    }

    async function load() {
      try {
        const [meetingRes, filesRes] = await Promise.all([
          fetch(`${API_URL}/meetings/${meetingId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/meetings/${meetingId}/files`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        if (meetingRes.status === 401 || filesRes.status === 401) {
          clearToken()
          router.replace('/login')
          return
        }
        if (meetingRes.status === 404) {
          setLoadError('Встреча не найдена')
          return
        }
        if (!meetingRes.ok || !filesRes.ok) throw new Error('load failed')

        setMeeting(await meetingRes.json())
        setFiles(await filesRes.json())
      } catch {
        setLoadError('Не удалось загрузить данные встречи')
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [meetingId, router])

  function handleAuthExpired() {
    clearToken()
    router.replace('/login')
  }

  async function handleDownload(file: MeetingFile) {
    const token = getToken()
    if (!token) return

    setActionError(null)
    try {
      const res = await fetch(`${API_URL}/meetings/${meetingId}/files/${file.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        handleAuthExpired()
        return
      }
      if (!res.ok) throw new Error('download failed')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.originalName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setActionError('Не удалось скачать файл')
    }
  }

  async function handleDelete(file: MeetingFile) {
    const token = getToken()
    if (!token) return

    setActionError(null)
    setDeletingId(file.id)
    try {
      const res = await fetch(`${API_URL}/meetings/${meetingId}/files/${file.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        handleAuthExpired()
        return
      }
      if (!res.ok) throw new Error('delete failed')
      setFiles((prev) => prev.filter((f) => f.id !== file.id))
    } catch {
      setActionError('Не удалось удалить файл')
    } finally {
      setDeletingId(null)
    }
  }

  function handleUpload(file: File) {
    const token = getToken()
    if (!token) return

    if (file.size > MAX_FILE_SIZE) {
      setUploadError('Файл слишком большой — максимальный размер 100 МБ')
      return
    }

    setUploadError(null)
    setIsUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', file)

    const xhr = new XMLHttpRequest()
    activeUploadRef.current = xhr

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
    }

    xhr.onload = () => {
      activeUploadRef.current = null
      setIsUploading(false)
      if (xhr.status === 401) {
        handleAuthExpired()
        return
      }
      if (xhr.status === 201) {
        const newFile = JSON.parse(xhr.responseText) as MeetingFile
        setFiles((prev) => [...prev, newFile])
        return
      }
      setUploadError(describeUploadError(xhr))
    }

    xhr.onerror = () => {
      activeUploadRef.current = null
      setIsUploading(false)
      setUploadError('Не удалось загрузить файл')
    }

    xhr.open('POST', `${API_URL}/meetings/${meetingId}/files`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  }

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--background)' }}
      >
        <Spinner size="lg" />
      </div>
    )
  }

  if (loadError || !meeting) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-4"
        style={{ background: 'var(--background)' }}
      >
        <p className="text-sm" style={{ color: 'var(--danger)' }}>
          {loadError ?? 'Встреча не найдена'}
        </p>
        <Link href="/" className="text-sm underline underline-offset-4">
          Вернуться к списку встреч
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: 'var(--background)' }}>
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm mb-4"
            style={{ color: 'var(--muted)' }}
          >
            <BackIcon />
            Все встречи
          </Link>
          <h1 className="text-lg font-bold leading-tight" style={{ color: 'var(--foreground)' }}>
            {meeting.title}
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            {formatDate(meeting.date)}
            {meeting.participants.length > 0 && ` · ${meeting.participants.join(', ')}`}
          </p>
        </div>

        {/* GET /meetings/:id already scopes to the owner (404 otherwise), so
            reaching this page implies ownership — no separate owner check needed
            before showing the delete button. */}
        <Card className="shadow-sm">
          <Card.Header>
            <Card.Title className="text-base">Файлы</Card.Title>
            <Card.Description>
              {files.length === 0 ? 'Файлов пока нет' : `Всего: ${files.length}`}
            </Card.Description>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3">
            <UploadZone
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              onSelectFile={handleUpload}
            />
            {uploadError && (
              <p
                className="text-sm"
                role="alert"
                aria-live="polite"
                style={{ color: 'var(--danger)' }}
              >
                {uploadError}
              </p>
            )}
            {actionError && (
              <p
                className="text-sm mb-1"
                role="alert"
                aria-live="polite"
                style={{ color: 'var(--danger)' }}
              >
                {actionError}
              </p>
            )}
            {files.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--muted)' }}>
                К этой встрече ещё не прикреплено ни одного файла
              </p>
            ) : (
              files.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  isDeleting={deletingId === file.id}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                />
              ))
            )}
          </Card.Content>
        </Card>
      </div>
    </div>
  )
}
