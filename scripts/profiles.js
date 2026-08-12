/**
 * Deterministic profile generation.
 *
 * The SNAP Facebook dataset is anonymised — nodes are just numeric ids.
 * To make the app feel real we attach a stable, realistic profile to every id:
 * a name, city, job, age and interests. Everything is derived from the id
 * with a seeded PRNG, so re-seeding the database produces identical profiles.
 */

const FIRST = [
  'Aarav', 'Amara', 'Anika', 'Arjun', 'Beatriz', 'Ben', 'Camila', 'Chloe',
  'Diego', 'Elena', 'Emeka', 'Emma', 'Fatima', 'Felix', 'Gabriel', 'Grace',
  'Hana', 'Hugo', 'Idris', 'Ines', 'Ivan', 'Jade', 'James', 'Jasmine',
  'Jonas', 'Kaia', 'Kiran', 'Laila', 'Liam', 'Lina', 'Luca', 'Luna',
  'Mateo', 'Maya', 'Mia', 'Milo', 'Nadia', 'Nico', 'Noor', 'Nora',
  'Oliver', 'Omar', 'Priya', 'Rafael', 'Ravi', 'Rosa', 'Sami', 'Sara',
  'Sofia', 'Tariq', 'Theo', 'Uma', 'Vera', 'Victor', 'Yara', 'Zara',
  'Zoe', 'Aditya', 'Bianca', 'Caleb', 'Dana', 'Ethan', 'Farah', 'Gina',
  'Hassan', 'Isla', 'Julia', 'Kenji', 'Leila', 'Marek', 'Nina', 'Owen',
  'Petra', 'Quinn', 'Riley', 'Sanjay', 'Tessa', 'Umar', 'Vivek', 'Wren',
  'Ximena', 'Yusuf', 'Anya', 'Bruno', 'Cecilia', 'Daniel', 'Eva', 'Finn',
  'Greta', 'Hector', 'Ingrid', 'Javier', 'Kofi', 'Lena', 'Marco', 'Nia',
]

const LAST = [
  'Adams', 'Adeyemi', 'Alvarez', 'Andersson', 'Banerjee', 'Barbosa', 'Bauer',
  'Bell', 'Bennett', 'Brooks', 'Campbell', 'Castillo', 'Costa', 'Cruz',
  'Davies', 'Diaz', 'Dubois', 'Dutta', 'Eriksson', 'Fischer', 'Foster',
  'Garcia', 'Gonzalez', 'Gupta', 'Harris', 'Hassan', 'Hernandez', 'Hoffmann',
  'Iyer', 'Jackson', 'Janssen', 'Johansson', 'Jones', 'Kaur', 'Khan',
  'Kim', 'Kowalski', 'Kumar', 'Lambert', 'Larsen', 'Lee', 'Lopez',
  'Martinez', 'Mehta', 'Meyer', 'Miller', 'Moller', 'Moreau', 'Mori',
  'Nakamura', 'Nelson', 'Novak', 'Okafor', 'Oliveira', 'Patel', 'Perez',
  'Petrov', 'Pham', 'Ramirez', 'Rao', 'Rossi', 'Sato', 'Schmidt',
  'Silva', 'Singh', 'Smith', 'Sorensen', 'Tanaka', 'Taylor', 'Thompson',
  'Torres', 'Verma', 'Walker', 'Wang', 'Weber', 'Wilson', 'Yamamoto',
  'Young', 'Zhang', 'Zimmerman', 'Ahmed', 'Brown', 'Carter', 'Evans',
  'Ferreira', 'Haddad', 'Ibrahim', 'Kovacs', 'Mensah', 'Nguyen', 'Osei',
  'Romero', 'Sharma', 'Sousa', 'Vargas', 'Wong', 'Zhao', 'Klein', 'Fujii',
]

const CITIES = [
  'Austin', 'Bangalore', 'Barcelona', 'Berlin', 'Bogotá', 'Boston', 'Buenos Aires',
  'Cape Town', 'Chicago', 'Copenhagen', 'Dubai', 'Dublin', 'Geneva', 'Helsinki',
  'Hong Kong', 'Istanbul', 'Jakarta', 'Kyoto', 'Lagos', 'Lisbon', 'London',
  'Los Angeles', 'Madrid', 'Manila', 'Melbourne', 'Mexico City', 'Miami', 'Milan',
  'Mumbai', 'Nairobi', 'New York', 'Oslo', 'Paris', 'Prague', 'Rio de Janeiro',
  'Rome', 'San Francisco', 'São Paulo', 'Seattle', 'Seoul', 'Shanghai', 'Singapore',
  'Stockholm', 'Sydney', 'Taipei', 'Tel Aviv', 'Tokyo', 'Toronto', 'Vancouver',
  'Vienna', 'Warsaw', 'Zurich',
]

const JOBS = [
  'Architect', 'Barista', 'Biomedical engineer', 'Chef', 'Civil engineer', 'Cloud engineer',
  'College student', 'Data scientist', 'Dentist', 'Designer', 'Doctor', 'Economist',
  'Film editor', 'Freelance writer', 'Game developer', 'Graphic designer', 'High school teacher',
  'Journalist', 'Lawyer', 'Marketing manager', 'ML researcher', 'Musician', 'Nurse',
  'Pharmacist', 'Photographer', 'Physicist', 'Pilot', 'Product manager', 'Professor',
  'Project manager', 'Psychologist', 'Robotics engineer', 'Sales manager', 'Software engineer',
  'Startup founder', 'UX researcher', 'Veterinarian', 'Video editor', 'Yoga instructor',
]

const INTERESTS = [
  'AI', 'architecture', 'astronomy', 'board games', 'camping', 'chess', 'cinema',
  'coffee', 'cooking', 'cycling', 'data science', 'fashion', 'gaming', 'hiking',
  'jazz', 'literature', 'machine learning', 'meditation', 'photography', 'poetry',
  'robotics', 'running', 'startups', 'surfing', 'travel', 'yoga',
]

/* ── small seeded PRNG (mulberry32) ─────────────────────────────────── */
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Build a deterministic profile for every user id in `ids`.
 * Names are sampled without replacement (unique across the network).
 */
export function buildProfiles(ids) {
  const nameRng = mulberry32(0x5eed_2024)
  const combos = shuffle(
    FIRST.flatMap((f) => LAST.map((l) => `${f} ${l}`)),
    nameRng,
  )

  return ids.map((id, i) => {
    const rng = mulberry32(0x9e37_79b9 ^ Math.imul(id, 2_654_435_761))
    const interestsPool = [...INTERESTS]
    const interestCount = 3 + Math.floor(rng() * 3) // 3–5
    const interests = []
    for (let k = 0; k < interestCount; k++) {
      interests.push(interestsPool.splice(Math.floor(rng() * interestsPool.length), 1)[0])
    }
    return {
      id,
      name: combos[i % combos.length],
      city: CITIES[Math.floor(rng() * CITIES.length)],
      job: JOBS[Math.floor(rng() * JOBS.length)],
      age: 19 + Math.floor(rng() * 46), // 19–64
      interests,
    }
  })
}
