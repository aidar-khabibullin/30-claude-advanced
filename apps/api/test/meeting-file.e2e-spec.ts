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
})
