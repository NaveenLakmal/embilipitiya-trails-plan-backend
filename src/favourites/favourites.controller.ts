import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FavouritesService } from './favourites.service';

type CustomerRequest = { user: { user_id: number } };

@ApiTags('Favourites')
@ApiBearerAuth('bearer')
@ApiResponse({
  status: 401,
  description: 'A valid customer access token is required.',
})
@UseGuards(JwtAuthGuard)
@Controller('favourites')
export class FavouritesController {
  constructor(
    @Inject(FavouritesService)
    private readonly favouritesService: FavouritesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List the current customer’s favourite places, newest first',
  })
  @ApiResponse({ status: 200, description: 'Array of saved places.' })
  getFavourites(@Req() req: CustomerRequest) {
    return this.favouritesService.findAll(req.user.user_id);
  }

  @Post(':placeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save a place to the current customer’s favourites (idempotent)',
  })
  @ApiResponse({
    status: 200,
    description: 'The saved place, including when already saved.',
  })
  @ApiResponse({ status: 400, description: 'Invalid place ID.' })
  @ApiResponse({ status: 404, description: 'Place not found.' })
  addFavourite(
    @Req() req: CustomerRequest,
    @Param('placeId', ParseIntPipe) placeId: number,
  ) {
    return this.favouritesService.add(req.user.user_id, placeId);
  }

  @Delete(':placeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Remove a place from the current customer’s favourites (idempotent)',
  })
  @ApiResponse({
    status: 204,
    description: 'Removed, including when not previously saved.',
  })
  @ApiResponse({ status: 400, description: 'Invalid place ID.' })
  async removeFavourite(
    @Req() req: CustomerRequest,
    @Param('placeId', ParseIntPipe) placeId: number,
  ): Promise<void> {
    await this.favouritesService.remove(req.user.user_id, placeId);
  }
}
