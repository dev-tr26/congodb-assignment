"""
Deterministic profile generation.

The SNAP Facebook dataset is anonymised — nodes are just numeric ids.
To make the app feel real we attach a stable, realistic profile to every id:
a name, city, job, age and interests. Everything is derived from the id
with a seeded PRNG, so re-seeding the database produces identical profiles.

This is an exact port of the original scripts/profiles.js (mulberry32 PRNG
in unsigned 32-bit space), so profiles stay byte-identical across the
Node → Python rewrite.
"""

FIRST = [
    "Aarav", "Amara", "Anika", "Arjun", "Beatriz", "Ben", "Camila", "Chloe",
    "Diego", "Elena", "Emeka", "Emma", "Fatima", "Felix", "Gabriel", "Grace",
    "Hana", "Hugo", "Idris", "Ines", "Ivan", "Jade", "James", "Jasmine",
    "Jonas", "Kaia", "Kiran", "Laila", "Liam", "Lina", "Luca", "Luna",
    "Mateo", "Maya", "Mia", "Milo", "Nadia", "Nico", "Noor", "Nora",
    "Oliver", "Omar", "Priya", "Rafael", "Ravi", "Rosa", "Sami", "Sara",
    "Sofia", "Tariq", "Theo", "Uma", "Vera", "Victor", "Yara", "Zara",
    "Zoe", "Aditya", "Bianca", "Caleb", "Dana", "Ethan", "Farah", "Gina",
    "Hassan", "Isla", "Julia", "Kenji", "Leila", "Marek", "Nina", "Owen",
    "Petra", "Quinn", "Riley", "Sanjay", "Tessa", "Umar", "Vivek", "Wren",
    "Ximena", "Yusuf", "Anya", "Bruno", "Cecilia", "Daniel", "Eva", "Finn",
    "Greta", "Hector", "Ingrid", "Javier", "Kofi", "Lena", "Marco", "Nia",
]

LAST = [
    "Adams", "Adeyemi", "Alvarez", "Andersson", "Banerjee", "Barbosa", "Bauer",
    "Bell", "Bennett", "Brooks", "Campbell", "Castillo", "Costa", "Cruz",
    "Davies", "Diaz", "Dubois", "Dutta", "Eriksson", "Fischer", "Foster",
    "Garcia", "Gonzalez", "Gupta", "Harris", "Hassan", "Hernandez", "Hoffmann",
    "Iyer", "Jackson", "Janssen", "Johansson", "Jones", "Kaur", "Khan",
    "Kim", "Kowalski", "Kumar", "Lambert", "Larsen", "Lee", "Lopez",
    "Martinez", "Mehta", "Meyer", "Miller", "Moller", "Moreau", "Mori",
    "Nakamura", "Nelson", "Novak", "Okafor", "Oliveira", "Patel", "Perez",
    "Petrov", "Pham", "Ramirez", "Rao", "Rossi", "Sato", "Schmidt",
    "Silva", "Singh", "Smith", "Sorensen", "Tanaka", "Taylor", "Thompson",
    "Torres", "Verma", "Walker", "Wang", "Weber", "Wilson", "Yamamoto",
    "Young", "Zhang", "Zimmerman", "Ahmed", "Brown", "Carter", "Evans",
    "Ferreira", "Haddad", "Ibrahim", "Kovacs", "Mensah", "Nguyen", "Osei",
    "Romero", "Sharma", "Sousa", "Vargas", "Wong", "Zhao", "Klein", "Fujii",
]

CITIES = [
    "Austin", "Bangalore", "Barcelona", "Berlin", "Bogotá", "Boston", "Buenos Aires",
    "Cape Town", "Chicago", "Copenhagen", "Dubai", "Dublin", "Geneva", "Helsinki",
    "Hong Kong", "Istanbul", "Jakarta", "Kyoto", "Lagos", "Lisbon", "London",
    "Los Angeles", "Madrid", "Manila", "Melbourne", "Mexico City", "Miami", "Milan",
    "Mumbai", "Nairobi", "New York", "Oslo", "Paris", "Prague", "Rio de Janeiro",
    "Rome", "San Francisco", "São Paulo", "Seattle", "Seoul", "Shanghai", "Singapore",
    "Stockholm", "Sydney", "Taipei", "Tel Aviv", "Tokyo", "Toronto", "Vancouver",
    "Vienna", "Warsaw", "Zurich",
]

JOBS = [
    "Architect", "Barista", "Biomedical engineer", "Chef", "Civil engineer", "Cloud engineer",
    "College student", "Data scientist", "Dentist", "Designer", "Doctor", "Economist",
    "Film editor", "Freelance writer", "Game developer", "Graphic designer", "High school teacher",
    "Journalist", "Lawyer", "Marketing manager", "ML researcher", "Musician", "Nurse",
    "Pharmacist", "Photographer", "Physicist", "Pilot", "Product manager", "Professor",
    "Project manager", "Psychologist", "Robotics engineer", "Sales manager", "Software engineer",
    "Startup founder", "UX researcher", "Veterinarian", "Video editor", "Yoga instructor",
]

INTERESTS = [
    "AI", "architecture", "astronomy", "board games", "camping", "chess", "cinema",
    "coffee", "cooking", "cycling", "data science", "fashion", "gaming", "hiking",
    "jazz", "literature", "machine learning", "meditation", "photography", "poetry",
    "robotics", "running", "startups", "surfing", "travel", "yoga",
]

_MASK32 = 0xFFFFFFFF


def mulberry32(seed):
    """Small seeded PRNG — exact port of the JS mulberry32.

    All arithmetic stays in unsigned 32-bit space, which yields the same
    low 32 bits as the JS `Math.imul` / `| 0` / `>>>` dance, and the float
    is computed the same way, so sequences are bit-identical.
    """
    state = seed & _MASK32

    def next_float():
        nonlocal state
        state = (state + 0x6D2B79F5) & _MASK32
        t = (state ^ (state >> 15)) & _MASK32
        t = (t * (state | 1)) & _MASK32
        # JS: t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t — the final
        # XOR uses the *old* t, so keep it before overwriting.
        product = (((t ^ (t >> 7)) & _MASK32) * (t | 61)) & _MASK32
        t = ((t + product) ^ t) & _MASK32
        t = (t ^ (t >> 14)) & _MASK32
        return t / 4294967296.0

    return next_float


def _shuffle(items, rng):
    for i in range(len(items) - 1, 0, -1):
        j = int(rng() * (i + 1))
        items[i], items[j] = items[j], items[i]
    return items


def build_profiles(ids):
    """Build a deterministic profile for every user id in `ids`.

    Names are sampled without replacement (unique across the network).
    """
    name_rng = mulberry32(0x5EED2024)
    combos = _shuffle(
        [f"{first} {last}" for first in FIRST for last in LAST],
        name_rng,
    )

    profiles = []
    for i, user_id in enumerate(ids):
        rng = mulberry32(((user_id * 2654435761) & _MASK32) ^ 0x9E3779B9)
        interests_pool = list(INTERESTS)
        interest_count = 3 + int(rng() * 3)  # 3–5
        interests = []
        for _ in range(interest_count):
            interests.append(interests_pool.pop(int(rng() * len(interests_pool))))
        profiles.append(
            {
                "id": user_id,
                "name": combos[i % len(combos)],
                "city": CITIES[int(rng() * len(CITIES))],
                "job": JOBS[int(rng() * len(JOBS))],
                "age": 19 + int(rng() * 46),  # 19–64
                "interests": interests,
            }
        )
    return profiles
