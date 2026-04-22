-- Sample seed data for dorm/room/bed endpoint testing (Nuel schema)
-- Safe to run multiple times due ON CONFLICT guards.

-- 1) Building
INSERT INTO buildings (id, code, name, location, total_floors, is_active)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'BLD-A',
  'Main Campus Building A',
  'North Gate',
  4,
  true
)
ON CONFLICT (code) DO NOTHING;

-- 2) Dorm
INSERT INTO dorms (id, building_id, code, name, gender_restriction, is_active)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'DORM-A',
  'Dorm A',
  'MALE_ONLY'::dorm_gender_restriction,
  true
)
ON CONFLICT (code) DO NOTHING;

-- 3) Rooms
INSERT INTO rooms (id, dorm_id, floor_number, room_number, capacity, status, is_active)
VALUES
  (
    '33333333-3333-3333-3333-333333333331',
    '22222222-2222-2222-2222-222222222222',
    1,
    'A-101',
    4,
    'ACTIVE'::room_status,
    true
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '22222222-2222-2222-2222-222222222222',
    1,
    'A-102',
    2,
    'ACTIVE'::room_status,
    true
  )
ON CONFLICT (dorm_id, room_number) DO NOTHING;

-- 4) Beds
INSERT INTO beds (id, room_id, bed_number, status, is_active)
VALUES
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333331', '1', 'AVAILABLE'::bed_status, true),
  ('44444444-4444-4444-4444-444444444402', '33333333-3333-3333-3333-333333333331', '2', 'AVAILABLE'::bed_status, true),
  ('44444444-4444-4444-4444-444444444403', '33333333-3333-3333-3333-333333333331', '3', 'OCCUPIED'::bed_status, true),
  ('44444444-4444-4444-4444-444444444404', '33333333-3333-3333-3333-333333333331', '4', 'OCCUPIED'::bed_status, true),
  ('44444444-4444-4444-4444-444444444405', '33333333-3333-3333-3333-333333333332', '1', 'OCCUPIED'::bed_status, true),
  ('44444444-4444-4444-4444-444444444406', '33333333-3333-3333-3333-333333333332', '2', 'OCCUPIED'::bed_status, true)
ON CONFLICT (room_id, bed_number) DO NOTHING;
