import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Place } from "./place.entity";
import { PlacesService } from "./places.service";
import { PlacesController } from "./places.controller";
import { StorageModule } from "../storage/storage.module";
import { AdminModule } from "../admin/admin.module";

@Module({
  imports: [TypeOrmModule.forFeature([Place]), StorageModule, AdminModule],
  providers: [PlacesService],
  controllers: [PlacesController],
  exports: [PlacesService],
})
export class PlacesModule {}
