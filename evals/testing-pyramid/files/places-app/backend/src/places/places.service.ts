import { Injectable } from '@nestjs/common';
import { Place } from './place';

@Injectable()
export class PlacesService {
  private readonly places: Place[] = [
    { id: 'p-1', name: 'Central station', latitude: 52.2297, longitude: 21.0122, fee: 'yes' },
    { id: 'p-2', name: 'City park', latitude: 52.2154, longitude: 21.0352, fee: 'no' },
  ];

  findAll(): Place[] {
    return this.places;
  }

  findOne(id: string): Place | undefined {
    return this.places.find((place) => place.id === id);
  }
}
