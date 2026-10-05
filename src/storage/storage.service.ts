import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import * as path from "node:path";

export interface UploadedFileDto {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadResult {
  url: string;
  key: string;
  filename: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client;
  private readonly bucketName: string;
  private readonly endpoint: string | undefined;
  private readonly publicUrl: string | undefined;

  constructor(private readonly config: ConfigService) {
    const clean = (val?: string | null) =>
      val ? val.replace(/^["']|["']$/g, "").trim() : undefined;

    const endpoint = clean(
      this.config.get<string>("AWS_ENDPOINT_URL_S3") ||
      this.config.get<string>("AWS_ENDPOINT_URL") ||
      this.config.get<string>("S3_ENDPOINT") ||
      this.config.get<string>("NEON_STORAGE_ENDPOINT") ||
      process.env.AWS_ENDPOINT_URL_S3 ||
      process.env.AWS_ENDPOINT_URL
    );

    const bucket = clean(
      this.config.get<string>("S3_BUCKET_NAME") ||
      this.config.get<string>("NEON_STORAGE_BUCKET") ||
      "places-image-bucket"
    )!;

    const accessKeyId = clean(
      this.config.get<string>("AWS_ACCESS_KEY_ID") ||
      this.config.get<string>("NEON_STORAGE_ACCESS_KEY_ID") ||
      process.env.AWS_ACCESS_KEY_ID
    );

    const secretAccessKey = clean(
      this.config.get<string>("AWS_SECRET_ACCESS_KEY") ||
      this.config.get<string>("NEON_STORAGE_SECRET_ACCESS_KEY") ||
      process.env.AWS_SECRET_ACCESS_KEY
    );

    const region = clean(
      this.config.get<string>("AWS_REGION") ||
      this.config.get<string>("AWS_DEFAULT_REGION") ||
      this.config.get<string>("NEON_STORAGE_REGION") ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      "eu-central-1"
    )!;

    this.publicUrl = clean(
      this.config.get<string>("S3_PUBLIC_URL") ||
      this.config.get<string>("NEON_STORAGE_PUBLIC_URL") ||
      process.env.S3_PUBLIC_URL
    );

    this.endpoint = endpoint;
    this.bucketName = bucket;

    const s3Config: S3ClientConfig = {
      forcePathStyle: true,
      region,
    };

    if (endpoint) {
      s3Config.endpoint = endpoint;
    }

    if (accessKeyId && secretAccessKey) {
      s3Config.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }

    this.s3Client = new S3Client(s3Config);

    if (accessKeyId && secretAccessKey) {
      this.logger.log(
        `✅ Initialized Neon S3 storage client for bucket "${bucket}" (region: ${region}, endpoint: ${endpoint || "default"})`
      );
    } else {
      this.logger.warn(
        `⚠️ S3 credentials (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) not found in .env. Initialized S3 client with default provider chain for bucket "${bucket}".`
      );
    }
  }

  async uploadPlaceImage(file: UploadedFileDto): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException("No file uploaded.");
    }

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
      "image/svg+xml",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Allowed types: JPEG, PNG, WebP, GIF, AVIF, SVG.`
      );
    }

    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSizeBytes) {
      throw new BadRequestException("File size must not exceed 10MB.");
    }

    const rawExt = path.extname(file.originalname).toLowerCase();
    const ext = rawExt || this.getExtFromMime(file.mimetype);
    const uniqueKey = `places/${Date.now()}-${randomUUID()}${ext}`;

    try {
      // Upload directly to Neon S3 storage bucket
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: uniqueKey,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );

      let finalUrl: string;
      if (this.publicUrl) {
        finalUrl = `${this.publicUrl.replace(/\/+$/, "")}/${uniqueKey}`;
      } else {
        // Generate presigned view URL (default: 7 days = 604800s, max for SigV4)
        const expiresIn =
          Number(this.config.get("S3_SIGNED_URL_EXPIRES_IN")) || 604800;
        finalUrl = await getSignedUrl(
          this.s3Client,
          new GetObjectCommand({
            Bucket: this.bucketName,
            Key: uniqueKey,
          }),
          { expiresIn }
        );
      }

      this.logger.log(`✅ Uploaded image to Neon storage "${this.bucketName}": ${uniqueKey}`);

      return {
        url: finalUrl,
        key: uniqueKey,
        filename: file.originalname,
      };
    } catch (err: any) {
      this.logger.error(`Failed to upload to Neon storage bucket "${this.bucketName}":`, err);

      throw new InternalServerErrorException(
        `Failed to upload image to Neon storage bucket "${this.bucketName}": ${err.message || "Unknown error"}. Please check your S3 connection details in .env.`
      );
    }
  }

  async uploadPlaceImages(files: UploadedFileDto[]): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException("No files uploaded.");
    }
    return Promise.all(files.map((file) => this.uploadPlaceImage(file)));
  }

  async getSignedViewUrl(key: string, expiresIn = 3600): Promise<string> {
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/+$/, "")}/${key}`;
    }

    try {
      return await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
        { expiresIn }
      );
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Failed to generate signed URL for key "${key}": ${err.message || "Unknown error"}`
      );
    }
  }

  private getExtFromMime(mime: string): string {
    switch (mime) {
      case "image/jpeg":
        return ".jpg";
      case "image/png":
        return ".png";
      case "image/webp":
        return ".webp";
      case "image/gif":
        return ".gif";
      case "image/svg+xml":
        return ".svg";
      case "image/avif":
        return ".avif";
      default:
        return ".jpg";
    }
  }
}
