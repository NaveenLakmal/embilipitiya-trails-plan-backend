import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { PlacesService } from "./places.service";
import { CreatePlaceDto } from "./dto/create-place.dto";
import { UpdatePlaceDto } from "./dto/update-place.dto";
import { StorageService, UploadedFileDto } from "../storage/storage.service";
import { AdminJwtGuard } from "../admin/guards/admin-jwt.guard";

@ApiTags("Places")
@Controller("places")
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List all places, with optional filtering" })
  @ApiQuery({ name: "category", required: false, type: Number, description: "Filter by category_id" })
  @ApiQuery({ name: "search", required: false, type: String, description: "Case-insensitive partial match on name" })
  @ApiResponse({ status: 200, description: "Array of places (empty if none match)" })
  findAll(
    @Query("category") category?: string,
    @Query("search") search?: string,
  ) {
    return this.placesService.findAll({
      category: category !== undefined ? parseInt(category, 10) : undefined,
      search,
    });
  }

  @Post("upload-image")
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: "Upload an image for a place to S3 bucket (Admin only)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Image uploaded successfully" })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  uploadImage(@UploadedFile() file: UploadedFileDto) {
    return this.storageService.uploadPlaceImage(file);
  }

  @Post("upload-images")
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @UseInterceptors(
    FilesInterceptor("files", 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: "Upload multiple images for a place to S3 bucket (Admin only)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "string",
            format: "binary",
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: "Images uploaded successfully" })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  uploadImages(@UploadedFiles() files: UploadedFileDto[]) {
    return this.storageService.uploadPlaceImages(files);
  }

  @Get("signed-url")
  @ApiOperation({ summary: "Get a presigned view URL for an S3 object key" })
  @ApiQuery({ name: "key", required: true, type: String, description: "S3 object key (e.g. places/...)" })
  @ApiResponse({ status: 200, description: "Presigned URL" })
  async getSignedUrl(@Query("key") key: string) {
    const url = await this.storageService.getSignedViewUrl(key);
    return { url, key };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one place by ID" })
  @ApiResponse({ status: 200, description: "The place record" })
  @ApiResponse({ status: 404, description: "Place not found." })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.placesService.findOne(id);
  }

  @Post()
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a new place (Admin only)" })
  @ApiResponse({ status: 201, description: "The created place" })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  create(@Body() dto: CreatePlaceDto) {
    return this.placesService.create(dto);
  }

  @Patch(":id")
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update an existing place (Admin only)" })
  @ApiResponse({ status: 200, description: "The updated place" })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  @ApiResponse({ status: 404, description: "Place not found." })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdatePlaceDto,
  ) {
    return this.placesService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a place (Admin only)" })
  @ApiResponse({ status: 204, description: "Deleted successfully" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  @ApiResponse({ status: 404, description: "Place not found." })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.placesService.remove(id);
  }
}
