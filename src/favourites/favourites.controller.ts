import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * FavouritesController — STUB ONLY.
 *
 * Favourites require an authenticated user, and the auth system has not been
 * built yet. All endpoints return 501 Not Implemented with a clear message.
 * Once auth (JWT + guards) is added in a later phase, these endpoints will
 * be fully implemented.
 */
@ApiTags('Favourites (stub)')
@Controller('favourites')
export class FavouritesController {
  private notYetAvailable() {
    return {
      statusCode: 501,
      message:
        'Favourites require an account, which is not yet implemented. This endpoint will be available once authentication is added.',
    };
  }

  @Get()
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @ApiOperation({ summary: '(STUB) List favourites — requires auth (not yet implemented)' })
  @ApiResponse({ status: 501, description: 'Not yet implemented' })
  getFavourites() {
    return this.notYetAvailable();
  }

  @Post(':placeId')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @ApiOperation({ summary: '(STUB) Add a favourite — requires auth (not yet implemented)' })
  @ApiResponse({ status: 501, description: 'Not yet implemented' })
  addFavourite(@Param('placeId') _placeId: string) {
    return this.notYetAvailable();
  }

  @Delete(':placeId')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @ApiOperation({ summary: '(STUB) Remove a favourite — requires auth (not yet implemented)' })
  @ApiResponse({ status: 501, description: 'Not yet implemented' })
  removeFavourite(@Param('placeId') _placeId: string) {
    return this.notYetAvailable();
  }
}
