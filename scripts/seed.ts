/**
 * Seed script — inserts the 6 categories and 12 sample places used in the
 * frontend mock data (src/data/places.ts).
 *
 * Usage:
 *   npm run seed
 *
 * Requires DATABASE_URL in .env (or environment variables).
 * Safe to run multiple times — uses upsert (on-conflict do-nothing) so it
 * won't create duplicates.
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { Category } from '../src/categories/category.entity';
import { Place } from '../src/places/place.entity';
import { User } from '../src/users/user.entity';
import { Favourite } from '../src/favourites/favourite.entity';
import { VisitPlan } from '../src/plan/visit-plan.entity';
import { PlanItem } from '../src/plan/plan-item.entity';
import { Admin } from '../src/admin/admin.entity';

// ─── Data ─────────────────────────────────────────────────────────────────────

const CATEGORIES: Partial<Category>[] = [
  { category_id: 1, name: 'Natural', description: 'Rivers, waterfalls, reservoirs and natural landscapes.' },
  { category_id: 2, name: 'Religious', description: 'Ancient temples, shrines and sacred sites.' },
  { category_id: 3, name: 'Heritage', description: 'Historical monuments, manor houses and cultural sites.' },
  { category_id: 4, name: 'Recreational', description: 'Wildlife parks, transit homes and outdoor activities.' },
  { category_id: 5, name: 'Restaurants', description: 'Local eateries and dining experiences.' },
  { category_id: 6, name: 'Public Places', description: 'Town parks, viewpoints and public spaces.' },
];

const PLACES: Partial<Place>[] = [
  {
    place_id: 1,
    category_id: 4,
    name: 'Udawalawe National Park',
    description:
      "One of Sri Lanka's finest wildlife parks, famous for large herds of wild elephants roaming open grassland against a backdrop of hills. Morning and late-afternoon jeep safaris offer the best sightings of elephants, buffalo, crocodiles and over 180 bird species.",
    opening_time: '06:00',
    closing_time: '18:00',
    latitude: 6.4744,
    longitude: 80.8889,
    distance_km: 22.4,
    travel_tips:
      'Book a jeep at the entrance early; carry water, a hat and binoculars. Safaris are cooler and busier with wildlife before 9:00 AM.',
    visit_duration_minutes: 180,
    photo_url: 'https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=1024',
  },
  {
    place_id: 2,
    category_id: 1,
    name: 'Chandrika Wewa Reservoir',
    description:
      'A wide, calm reservoir on the edge of Embilipitiya, ringed by palms and low hills. A favourite spot for sunrise reflections, birdwatching along the bund and quiet evening walks.',
    opening_time: '05:30',
    closing_time: '19:00',
    latitude: 6.3213,
    longitude: 80.8106,
    distance_km: 4.6,
    travel_tips:
      'The bund road gives the best views. Visit at sunrise or just before sunset; there is little shade at midday.',
    visit_duration_minutes: 60,
    photo_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1024',
  },
  {
    place_id: 3,
    category_id: 1,
    name: 'Diyawini Ella Falls',
    description:
      'A cool jungle waterfall tumbling over dark rock into a natural bathing pool. The short forest walk in is shaded and green year round, and the pool is shallow enough for a refreshing dip.',
    opening_time: '07:00',
    closing_time: '17:30',
    latitude: 6.4602,
    longitude: 80.7421,
    distance_km: 18.9,
    travel_tips:
      'Rocks are slippery after rain — wear grip footwear. Avoid swimming during heavy monsoon flow.',
    visit_duration_minutes: 90,
    photo_url: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1024',
  },
  {
    place_id: 4,
    category_id: 3,
    name: 'Maduwanwela Walawwa',
    description:
      "A grand 18th-century manor house of the Maduwanwela chieftains, with carved timber pillars, tiled roofs and shaded courtyards. A rare, atmospheric window into Sri Lanka's colonial-era feudal architecture.",
    opening_time: '08:30',
    closing_time: '16:30',
    latitude: 6.4111,
    longitude: 80.7024,
    distance_km: 24.1,
    travel_tips:
      'A caretaker gives short guided walks; a small donation is appreciated. Photography is allowed in the courtyards.',
    visit_duration_minutes: 60,
    photo_url: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=1024',
  },
  {
    place_id: 5,
    category_id: 2,
    name: 'Sankapala Raja Maha Viharaya',
    description:
      'An ancient rock temple set on a granite outcrop, with a white stupa, drip-ledged caves and centuries-old inscriptions. Wide views over the surrounding countryside from the upper terrace.',
    opening_time: '06:00',
    closing_time: '18:30',
    latitude: 6.4359,
    longitude: 80.7658,
    distance_km: 16.2,
    travel_tips:
      'Remove shoes and hats at the temple platform; dress modestly with shoulders and knees covered.',
    visit_duration_minutes: 45,
    photo_url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1024',
  },
  {
    place_id: 6,
    category_id: 2,
    name: 'Handagiriya Ancient Temple',
    description:
      'A quiet hilltop monastic site with ruined brick foundations, a small shrine room and old bo trees. Peaceful, rarely crowded, and a good short stop between the town and the hills.',
    opening_time: '06:30',
    closing_time: '18:00',
    latitude: 6.5074,
    longitude: 80.8331,
    distance_km: 19.4,
    travel_tips: 'The final stretch is a narrow lane — a tuk-tuk is easier than a van.',
    visit_duration_minutes: 45,
    photo_url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1024',
  },
  {
    place_id: 7,
    category_id: 3,
    name: 'Panamure Elephant Kraal',
    description:
      'The site of the last traditional elephant kraal held in Sri Lanka, preserved as a memorial. Interpretation boards tell the story of the 1950 capture and the change in attitudes that followed.',
    opening_time: '08:00',
    closing_time: '17:00',
    latitude: 6.3906,
    longitude: 80.6742,
    distance_km: 21.3,
    travel_tips: 'Very little shade — go early. Combine with Maduwanwela Walawwa on the same road.',
    visit_duration_minutes: 45,
    photo_url: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=1024',
  },
  {
    place_id: 8,
    category_id: 1,
    name: 'Walawe River Bank',
    description:
      'A broad sandy bend of the Walawe Ganga fringed with coconut palms, with hills fading into the distance. Popular for picnics, riverside photography and watching fishing boats at dusk.',
    opening_time: '05:00',
    closing_time: '19:00',
    latitude: 6.3128,
    longitude: 80.8752,
    distance_km: 6.8,
    travel_tips: 'Currents are strong after upstream rain — stay on the sandbank rather than wading.',
    visit_duration_minutes: 45,
    photo_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1024',
  },
  {
    place_id: 9,
    category_id: 4,
    name: 'Elephant Transit Home',
    description:
      'A government-run halfway home where orphaned elephant calves are rehabilitated before release into the wild. Visitors watch the feeding sessions from a raised viewing platform.',
    opening_time: '08:30',
    closing_time: '18:00',
    latitude: 6.4425,
    longitude: 80.8925,
    distance_km: 20.1,
    travel_tips:
      'Feeding times are at 9:00, 12:00, 15:00 and 18:00 — arrive 20 minutes early for a good spot.',
    visit_duration_minutes: 60,
    photo_url: 'https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=1024',
  },
  {
    place_id: 10,
    category_id: 6,
    name: 'Embilipitiya Town Park',
    description:
      'A shaded green square in the middle of town with walking paths, benches and evening food carts. An easy place to rest between longer trips out of the town.',
    opening_time: '05:30',
    closing_time: '21:00',
    latitude: 6.3421,
    longitude: 80.8524,
    distance_km: 0.6,
    travel_tips: 'Busiest and most fun after 5:00 PM when the street-food stalls open.',
    visit_duration_minutes: 30,
    photo_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1024',
  },
  {
    place_id: 11,
    category_id: 5,
    name: 'Walawe Rice & Curry Garden',
    description:
      'An open-air, thatched-roof eatery serving generous Sri Lankan rice and curry plates, kottu and river fish, cooked to order with produce from nearby villages.',
    opening_time: '07:00',
    closing_time: '22:00',
    latitude: 6.3372,
    longitude: 80.8571,
    distance_km: 1.9,
    travel_tips: 'Ask for the mild option if you are not used to Sri Lankan chilli levels.',
    visit_duration_minutes: 60,
    photo_url: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1024',
  },
  {
    place_id: 12,
    category_id: 6,
    name: 'Weliwewa Viewpoint',
    description:
      'A simple roadside viewpoint above the paddy plains, looking towards the Sabaragamuwa hills. A classic golden-hour stop on the way back into Embilipitiya.',
    opening_time: '05:00',
    closing_time: '19:30',
    latitude: 6.2871,
    longitude: 80.8218,
    distance_km: 9.2,
    travel_tips: 'Parking is limited to the gravel shoulder — pull in fully off the road.',
    visit_duration_minutes: 30,
    photo_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1024',
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [Category, Place, User, Favourite, VisitPlan, PlanItem, Admin],
    synchronize: true,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
    logging: ['error'],
  });

  await dataSource.initialize();
  console.log('✅ Database connected');

  const categoryRepo = dataSource.getRepository(Category);
  const placeRepo = dataSource.getRepository(Place);

  // Upsert categories
  for (const cat of CATEGORIES) {
    await categoryRepo.upsert(cat as Category, ['category_id']);
  }
  console.log(`✅ ${CATEGORIES.length} categories seeded`);

  // Upsert places
  for (const place of PLACES) {
    await placeRepo.upsert(place as Place, ['place_id']);
  }
  console.log(`✅ ${PLACES.length} places seeded`);

  await dataSource.destroy();
  console.log('\n🌱 Seed complete! Run `npm run start:dev` to start the API.\n');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
