import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { UsersModule } from '../users/users.module'
import { AuthController } from './auth.controller'
import { LoginHandler } from './handlers/login.handler'
import { RegisterHandler } from './handlers/register.handler'
import { AppJwtModule } from './jwt-config.module'

@Module({
  imports: [CqrsModule, AppJwtModule, UsersModule],
  controllers: [AuthController],
  providers: [RegisterHandler, LoginHandler],
})
export class AuthModule {}
