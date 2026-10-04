import { Field, Float, ObjectType, InputType, registerEnumType } from '@nestjs/graphql';
import { Prop, Schema } from '@nestjs/mongoose';

/** Les métiers couverts par la place de marché. */
export enum Metier {
  PLOMBERIE = 'PLOMBERIE',
  ELECTRICITE = 'ELECTRICITE',
  MENUISERIE = 'MENUISERIE',
  PEINTURE = 'PEINTURE',
  MACONNERIE = 'MACONNERIE',
  CLIMATISATION = 'CLIMATISATION',
  SERRURERIE = 'SERRURERIE',
  CARRELAGE = 'CARRELAGE',
}
registerEnumType(Metier, { name: 'Metier' });

export enum Role {
  CLIENT = 'CLIENT',
  ARTISAN = 'ARTISAN',
  ADMIN = 'ADMIN',
}
registerEnumType(Role, { name: 'Role' });

/**
 * Une position, au format GeoJSON — le seul que MongoDB indexe en 2dsphere.
 *
 * ── L'ordre des coordonnées ─────────────────────────────────────────────────
 * GeoJSON écrit [LONGITUDE, LATITUDE]. C'est l'inverse de l'habitude humaine,
 * de Google Maps, et de tout ce qu'on lit dans un GPS. Inverser les deux ne
 * provoque aucune erreur : la requête réussit, et répond que l'artisan de
 * Marrakech est à 3 000 km. Une recherche qui ne trouve rien, sans message.
 *
 * D'où un type dédié, des noms explicites, et une fabrique qui range les
 * valeurs dans le bon ordre — pour que l'ordre ne soit écrit qu'une fois.
 */
@Schema({ _id: false })
@ObjectType('Position')
export class Position {
  @Prop({ type: String, enum: ['Point'], required: true, default: 'Point' })
  @Field(() => String)
  type: 'Point';

  @Prop({ type: [Number], required: true })
  coordinates: [number, number];

  @Field(() => Float, { description: 'Longitude en degrés décimaux.' })
  get longitude(): number {
    return this.coordinates[0];
  }

  @Field(() => Float, { description: 'Latitude en degrés décimaux.' })
  get latitude(): number {
    return this.coordinates[1];
  }
}

export const positionDepuis = (latitude: number, longitude: number) => ({
  type: 'Point' as const,
  coordinates: [longitude, latitude] as [number, number],
});

@InputType('PositionEntree')
export class PositionEntree {
  @Field(() => Float)
  latitude: number;

  @Field(() => Float)
  longitude: number;
}
