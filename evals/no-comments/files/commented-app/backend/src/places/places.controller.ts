import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Place } from './place';
import { PlacesService } from './places.service';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get()
  findAll(): Place[] {
    return this.placesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Place {
    const place = this.placesService.findOne(id);
    if (!place) {
      throw new NotFoundException();
    }
    return place;
  }
}
