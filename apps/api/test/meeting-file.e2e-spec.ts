import * as fs from 'fs'
import * as path from 'path'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

describe('MeetingFiles (e2e)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService
  let token: string
  let meetingId: string

  const userCredentials = { email: 'meetingfileuser@example.com', password: 'Password1!' }
  const testUploadDir = process.env['UPLOAD_DIR'] ?? './uploads'

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }))
    await app.register(import('@fastify/multipart'), {
      limits: { fileSize: 100 * 1_024 * 1_024, files: 1 },
    })
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    prisma = app.get(PrismaService)
    await prisma.meetingFile.deleteMany()
    await prisma.meeting.deleteMany()
    await prisma.user.deleteMany()

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userCredentials)
      .expect(201)

    token = res.body.token

    const meetingRes = await request(app.getHttpServer())
      .post('/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Встреча с файлами', date: '2026-06-01T10:00:00.000Z', participants: [] })
      .expect(201)

    meetingId = meetingRes.body.id
  })

  afterAll(async () => {
    await prisma.meetingFile.deleteMany()
    await prisma.meeting.deleteMany()
    await prisma.user.deleteMany()
    await app.close()
    fs.rmSync(path.join(testUploadDir, 'meetings', meetingId), { recursive: true, force: true })
  })

  describe('POST /meetings/:id/files', () => {
    it('201: загружает файл и возвращает метаданные', async () => {
      const res = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('dummy content'), {
          filename: 'test.txt',
          contentType: 'text/plain',
        })
        .expect(201)

      expect(res.body).toMatchObject({
        meetingId,
        originalName: 'test.txt',
        mimeType: 'text/plain',
      })
      expect(res.body).toHaveProperty('id')
    })

    it('400: недопустимый тип файла', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('malicious'), {
          filename: 'virus.exe',
          contentType: 'application/x-msdownload',
        })
        .expect(400)
    })

    it('401: запрос без токена', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .attach('file', Buffer.from('dummy content'), {
          filename: 'test.txt',
          contentType: 'text/plain',
        })
        .expect(401)
    })

    it('404: встреча не найдена', async () => {
      await request(app.getHttpServer())
        .post('/meetings/00000000-0000-0000-0000-000000000000/files')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('dummy content'), {
          filename: 'test.txt',
          contentType: 'text/plain',
        })
        .expect(404)
    })

    it('201: имя файла с path traversal сохраняется без выхода за пределы папки загрузки', async () => {
      const res = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('dummy content'), {
          filename: '../../../../etc/traversal.txt',
          contentType: 'text/plain',
        })
        .expect(201)

      expect(res.body.filePath).not.toContain('..')
      expect(fs.existsSync(res.body.filePath)).toBe(true)
      expect(path.resolve(res.body.filePath).startsWith(path.resolve(testUploadDir))).toBe(true)
    })
  })

  describe('GET /meetings/:id/files', () => {
    it('200: загруженный файл появляется в списке файлов встречи', async () => {
      await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('second file content'), {
          filename: 'second.txt',
          contentType: 'text/plain',
        })
        .expect(201)

      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(Array.isArray(res.body)).toBe(true)
      const names = res.body.map((f: { originalName: string }) => f.originalName)
      expect(names).toContain('second.txt')
    })

    it('401: запрос без токена', async () => {
      await request(app.getHttpServer()).get(`/meetings/${meetingId}/files`).expect(401)
    })
  })

  describe('GET /meetings/:id/files/:fileId/download', () => {
    let fileId: string

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('download me'), {
          filename: 'download.txt',
          contentType: 'text/plain',
        })
        .expect(201)

      fileId = res.body.id
    })

    it('200: возвращает файл с корректным Content-Disposition', async () => {
      const res = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}/download`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(res.headers['content-disposition']).toMatch(/attachment/)
      expect(res.headers['content-disposition']).toMatch(/download\.txt/)
      expect(res.text).toBe('download me')
    })

    it('401: запрос без токена', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/${fileId}/download`)
        .expect(401)
    })

    it('404: файл не найден', async () => {
      await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files/00000000-0000-0000-0000-000000000000/download`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
    })
  })

  describe('DELETE /meetings/:id/files/:fileId', () => {
    const otherUserCredentials = { email: 'meetingfileother@example.com', password: 'Password1!' }
    let otherToken: string
    let noAuthFileId: string

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(otherUserCredentials)
        .expect(201)

      otherToken = res.body.token

      const uploadRes = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('no auth delete attempt'), {
          filename: 'no-auth.txt',
          contentType: 'text/plain',
        })
        .expect(201)

      noAuthFileId = uploadRes.body.id
    })

    it('404: чужой пользователь не может удалить файл', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('protected content'), {
          filename: 'protected.txt',
          contentType: 'text/plain',
        })
        .expect(201)

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${uploadRes.body.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404)
    })

    it('200: владелец удаляет файл, файл пропадает из списка и с диска', async () => {
      const uploadRes = await request(app.getHttpServer())
        .post(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('to be deleted'), {
          filename: 'delete-me.txt',
          contentType: 'text/plain',
        })
        .expect(201)

      const filePath = uploadRes.body.filePath as string

      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${uploadRes.body.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      const listRes = await request(app.getHttpServer())
        .get(`/meetings/${meetingId}/files`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      const ids = listRes.body.map((f: { id: string }) => f.id)
      expect(ids).not.toContain(uploadRes.body.id)
      expect(fs.existsSync(filePath)).toBe(false)
    })

    it('401: запрос без токена', async () => {
      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/${noAuthFileId}`)
        .expect(401)
    })

    it('404: файл не найден', async () => {
      await request(app.getHttpServer())
        .delete(`/meetings/${meetingId}/files/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
    })
  })
})
