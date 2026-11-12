import { Module } from '@nestjs/common';
import { UsersFileService } from './users-file.service';

@Module({
  providers: [UsersFileService],
  exports: [UsersFileService],
})
export class UsersFileModule {}
