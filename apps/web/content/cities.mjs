// City pages: genuinely local, useful content (well-known public places only; no prices or opening hours).
const D = "2026-10-13";
const parent = { name: "Dating in your city", path: "dating/" };

function city({ slug, name, region, intro, ideas, getting, safety, extra = "", faq = [], related = [] }) {
  return {
    path: `dating/${slug}/`, parent, crumb: `Dating in ${name}`, published: D, updated: D, eyebrow: `CITIES · ${name.toUpperCase()}`,
    title: `Dating in ${name} — First-Date Ideas & a Safer Dating App | Paire`,
    description: `Dating in ${name}: first-date ideas at places locals love, how to stay safe, and how to meet verified singles in ${name} on Paire, where every like comes with a note.`,
    h1: `Dating in <em>${name}</em>`,
    lede: intro,
    about: { "@type": "City", name, containedInPlace: { "@type": "State", name: region } },
    body: `
<h2>First-date ideas in ${name}</h2>
<ul>${ideas.map(([place, why]) => `<li><strong>${place}</strong>: ${why}</li>`).join("")}</ul>
<h2>Getting there and back</h2>
<p>${getting}</p>
<h2>Staying safe on a first date in ${name}</h2>
<ul>
<li>Meet somewhere public and busy for the first date, and get there on your own.</li>
<li>${safety}</li>
<li>Tell a friend who you're meeting and where. Share your live location if you like.</li>
<li>Keep the chat on Paire until you're comfortable. Never send money, OTPs or "investment" help to someone you've just met. See <a href="/guides/dating-scams-india/">common dating scams</a>.</li>
</ul>
${extra}
<h2>Meeting people in ${name} on Paire</h2>
<p>Paire shows people near you with an approximate distance (never your exact location). Members confirm their email before liking or chatting; photo verification is a separate check. Every like can carry a note, and seeing who likes you comes with Paire Plus. Set your intention, from casual to serious, and turn on <em>same intentions only</em> to see people who want the same thing. Women can accept only likes with a note and choose to message first.</p>`,
    faq: [
      [`Is there a good dating app in ${name}?`, `Paire serves ${name} and the rest of India. Likes can carry notes, women have free privacy controls, and Plus reveals who likes you. Confirmed email is required before liking or chatting; photo-check badges are separate.`],
      [`Where should I go on a first date in ${name}?`, `Somewhere public and easy to leave, like ${ideas[0][0]} or ${ideas[1][0]}. Coffee or a walk in daylight keeps a first meeting relaxed.`],
      ...faq
    ],
    related: ["guides/first-date-ideas-india/", "guides/dating-app-safety-tips-india/", ...related]
  };
}

export const cities = [
  city({
    slug: "delhi", name: "Delhi", region: "Delhi",
    intro: "Delhi is where Paire started. The city mixes centuries-old monuments with some of India's best cafés, which makes it one of the easiest places in the country to plan a good first date.",
    ideas: [
      ["Lodhi Garden", "a long walk among 15th-century tombs, busy with walkers in the morning and evening, with Khan Market's cafés a few minutes away"],
      ["Sunder Nursery", "landscaped gardens next to Humayun's Tomb; relaxed, green and great for conversation"],
      ["Hauz Khas", "the Deer Park and lake for a walk, then the village's cafés and bookshops"],
      ["Connaught Place", "central, on the Metro, and full of places to eat; easy to leave whenever you like"],
      ["Dilli Haat (INA)", "crafts stalls and food from every state, so there's always something to talk about"],
      ["Majnu ka Tilla", "Tibetan cafés and momos; casual and fun for a second date"]
    ],
    getting: "The Delhi Metro reaches most date spots and is the easiest way to travel on your own. For late evenings use a ride app and share the trip with a friend.",
    safety: "In winter it gets dark early: plan daytime or early-evening meetings, and choose places near a Metro station.",
    faq: [["Is Paire available across Delhi NCR?", "Yes. Paire is open across Delhi NCR (Delhi, Noida, Gurugram, Faridabad and Ghaziabad) and the rest of India."]],
    related: ["dating/gurugram/", "dating/noida/"]
  }),
  city({
    slug: "gurugram", name: "Gurugram", region: "Haryana",
    intro: "Gurugram's offices mean a lot of young professionals who are short on time. Dates here tend to start after work or on weekends, and good first-date spots are concentrated in a few walkable hubs.",
    ideas: [
      ["Cyber Hub", "dozens of restaurants and cafés in one walkable, busy place; ideal for a low-pressure first meeting"],
      ["Galleria Market", "a lively market square with cafés and dessert shops"],
      ["Aravalli Biodiversity Park", "an early-morning walk or run if you both like the outdoors"],
      ["Sector 29", "restaurants and bars close together, good for an evening date"],
      ["Golf Course Road cafés", "quieter coffee spots for a proper conversation"]
    ],
    getting: "The Rapid Metro and Yellow Line connect the main hubs. After dark, take a ride app and share your trip.",
    safety: "Stick to busy hubs like Cyber Hub for a first date, and avoid offers to drive you home on a first meeting.",
    related: ["dating/delhi/", "dating/noida/"]
  }),
  city({
    slug: "noida", name: "Noida", region: "Uttar Pradesh",
    intro: "Noida and Greater Noida have grown into a home for students and young professionals, with big malls, parks and easy Metro links to Delhi.",
    ideas: [
      ["Sector 18 market", "the city's busiest market, with plenty of cafés and food; easy to find and easy to leave"],
      ["DLF Mall of India", "food, a film or bowling; good on a hot or rainy day"],
      ["Okhla Bird Sanctuary", "a quiet morning walk on the Yamuna, best in winter when migratory birds arrive"],
      ["Noida Haat (Shilp Haat)", "craft fairs and food stalls during festivals and exhibitions"],
      ["Botanical Garden area", "a green walk, right by a Metro station"]
    ],
    getting: "The Blue and Aqua Lines connect Noida with Delhi and Greater Noida. Late at night use a ride app.",
    safety: "Large malls are good first-date spots because they are busy, well lit and easy to leave.",
    related: ["dating/delhi/", "dating/gurugram/"]
  }),
  city({
    slug: "mumbai", name: "Mumbai", region: "Maharashtra",
    intro: "Mumbai never really stops, and neither does its dating scene. Long commutes mean people value dates that are easy to reach and worth the trip.",
    ideas: [
      ["Marine Drive", "the classic: a walk along the sea at sunset, then dinner nearby"],
      ["Bandra's Carter Road and Bandstand", "seafront promenades with cafés all around"],
      ["Kala Ghoda", "galleries, cafés and street art in South Mumbai; around the Kala Ghoda Arts Festival it's buzzing"],
      ["Prithvi Theatre, Juhu", "a play and coffee at the café; built-in conversation"],
      ["Sanjay Gandhi National Park", "a morning walk or cycle if you both love the outdoors"],
      ["Colaba Causeway", "street shopping and old cafés"]
    ],
    getting: "Pick somewhere that works for both of you on the local trains or Metro, and avoid peak-hour plans. Share your ride after dark.",
    safety: "In the monsoon, choose indoor places with a backup plan, and check train updates before you set out.",
    related: ["dating/pune/"]
  }),
  city({
    slug: "bengaluru", name: "Bengaluru", region: "Karnataka",
    intro: "Bengaluru's mild weather, café culture and huge young workforce make it one of India's most active cities for dating. Traffic is the only villain.",
    ideas: [
      ["Cubbon Park", "a shaded walk in the middle of the city; lovely on weekend mornings"],
      ["Lalbagh Botanical Garden", "gardens and the glasshouse; flower shows around Republic and Independence Day"],
      ["Church Street", "bookshops, cafés and live music"],
      ["Indiranagar", "plenty of cafés and restaurants within a short walk"],
      ["Koramangala", "relaxed cafés for a long conversation"],
      ["Nandi Hills sunrise", "a drive for a later date once you know each other"]
    ],
    getting: "Choose a place on or near the Namma Metro, or meet halfway to beat the traffic. Share your ride after dark.",
    safety: "Save day trips like Nandi Hills for after a few dates, once you know and trust the person.",
    related: ["dating/hyderabad/", "dating/chennai/"]
  }),
  city({
    slug: "pune", name: "Pune", region: "Maharashtra",
    intro: "With its universities, IT parks and easy-going pace, Pune has a young, open dating scene, and quick escapes into the hills for later dates.",
    ideas: [
      ["Koregaon Park", "leafy lanes full of cafés and restaurants"],
      ["FC Road and JM Road", "student favourites: affordable, lively and central"],
      ["Aga Khan Palace", "history and gardens for a calm afternoon"],
      ["Vetal Tekdi", "a short hill walk with city views"],
      ["Sinhagad Fort", "a trek for a later date, once you know each other"]
    ],
    getting: "Pune's Metro and ride apps cover the main areas. Plan treks in daylight and with friends until you know the person.",
    safety: "Keep hill and fort trips for later dates, and go in daylight.",
    related: ["dating/mumbai/"]
  }),
  city({
    slug: "hyderabad", name: "Hyderabad", region: "Telangana",
    intro: "Hyderabad blends old-city charm with a booming tech scene. Food is half the reason to go on a date here.",
    ideas: [
      ["Necklace Road and Hussain Sagar", "a lakeside walk in the evening"],
      ["Durgam Cheruvu", "the lake and cable bridge lit up at night"],
      ["Lamakaan, Banjara Hills", "an open cultural space with talks, plays and cheap chai"],
      ["Jubilee Hills cafés", "relaxed spots for long conversations"],
      ["Golconda Fort", "history and views for a later daytime date"],
      ["Charminar and Laad Bazaar", "bangles, street food and the old city's energy"]
    ],
    getting: "The Hyderabad Metro covers the main corridors; use a ride app late at night and share your trip.",
    safety: "Busy markets are fun but crowded: agree on a clear meeting point first.",
    related: ["dating/bengaluru/", "dating/chennai/"]
  }),
  city({
    slug: "chennai", name: "Chennai", region: "Tamil Nadu",
    intro: "Chennai's beaches, music and filter coffee make for relaxed first dates. The city can feel traditional, which is why privacy controls matter.",
    ideas: [
      ["Besant Nagar (Elliot's Beach)", "a beach walk and cafés along the road"],
      ["Marina Beach", "the long sea front, best at sunrise or sunset"],
      ["Mylapore", "temples, old streets and some of the city's best filter coffee"],
      ["DakshinaChitra", "a heritage museum on the East Coast Road for a daytime date"],
      ["Nungambakkam and Alwarpet cafés", "quiet places to talk"]
    ],
    getting: "The Chennai Metro and suburban trains connect most areas; share your ride after dark.",
    safety: "If you want to keep dating private from family or neighbours, use incognito and private photos on Paire.",
    related: ["dating/bengaluru/", "dating/hyderabad/"]
  }),
  city({
    slug: "kolkata", name: "Kolkata", region: "West Bengal",
    intro: "Kolkata is made for long conversations: over coffee, books, food and the river. Dates here are rarely rushed.",
    ideas: [
      ["Victoria Memorial gardens", "a walk around the city's most famous monument"],
      ["Prinsep Ghat", "the riverside at sunset, under the Vidyasagar Setu"],
      ["Park Street", "classic restaurants, cafés and music"],
      ["College Street and Indian Coffee House", "books and coffee in a historic room"],
      ["Rabindra Sarobar", "a lakeside walk in South Kolkata"]
    ],
    getting: "The Metro and app cabs make it easy to get around; share your ride late at night.",
    safety: "During Durga Puja the city is packed: agree on a precise meeting point and keep your phone charged.",
    related: ["dating/delhi/"]
  }),
  city({
    slug: "ahmedabad", name: "Ahmedabad", region: "Gujarat",
    intro: "Ahmedabad's riverfront, night food markets and the biggest Navratri in India make it a great city for dates, especially in October.",
    ideas: [
      ["Sabarmati Riverfront and Atal Bridge", "a walk by the river, especially in the evening"],
      ["Law Garden night market", "street food and shopping after dark"],
      ["Manek Chowk", "the famous late-night food square in the old city"],
      ["Kankaria Lake", "a lakeside walk with lots to do"],
      ["Sabarmati Ashram", "a calm, meaningful daytime visit"]
    ],
    getting: "Ahmedabad's Metro, BRTS and ride apps cover the main areas; share your ride at night.",
    safety: "At big Garba events, go with your group, agree on a meeting point and share your pass only once you're comfortable.",
    extra: `<h2>Navratri and Garba</h2><p>Garba and Dandiya nights are a classic way to meet people in Ahmedabad. Go with a group, meet in the crowd and share your pass only once you're comfortable. Paire's 2026 Garba Nights edition has ended; it may return in a future Navratri.</p>`,
    faq: [["How do I find a Garba partner in Ahmedabad?", "Paire's 2026 Garba Nights edition has ended. Until Navratri returns, you can still meet people through ordinary discovery, and plan a relaxed first meeting together with Date Duet."]],
    related: ["dating/jaipur/"]
  }),
  city({
    slug: "jaipur", name: "Jaipur", region: "Rajasthan",
    intro: "Jaipur's forts, bazaars and rooftop cafés give it a romance few cities can match, with a younger crowd than its old walls suggest.",
    ideas: [
      ["Nahargarh Fort", "sunset over the city; go in a group or once you know each other"],
      ["Jawahar Kala Kendra", "art, theatre and a café in a calm campus"],
      ["Patrika Gate, Jawahar Circle", "a colourful walk in the evening"],
      ["Bapu Bazaar and Johari Bazaar", "shopping and street food in the old city"],
      ["C-Scheme cafés", "relaxed places to talk"]
    ],
    getting: "Jaipur Metro covers part of the city; ride apps are easiest at night, and share your trip.",
    safety: "Forts and hilltop spots are better for later dates, in daylight or with friends.",
    related: ["dating/ahmedabad/", "dating/delhi/"]
  })
];
