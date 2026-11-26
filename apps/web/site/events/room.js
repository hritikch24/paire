const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id");
let session;
try {
  session =
    sessionStorage.getItem("paire.preview." + id) || crypto.randomUUID();
  sessionStorage.setItem("paire.preview." + id, session);
} catch {
  /* Browsing also works without storage. */
}
const call = async (name, data) => {
  const res = await fetch("/events/api/" + name + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { id, ...data } }),
  });
  if (!res.ok) throw Error("Room unavailable. Refresh the page to try again.");
  return (await res.json()).result;
};
let deck;
let count = 0,
  index = 0,
  passed = [],
  revision = 0;
function render() {
  $("card").toggleAttribute("data-profile", count > 0);
  $("next").disabled = !count;
  $("back").disabled = !passed.length;
  $("card").textContent = count
    ? "Private profile · " +
      (index + 1) +
      " of " +
      count +
      " in this preview. These cards repeat."
    : "No preview cards available for this selection.";
}
$("next").onclick = () => {
  passed = [...passed, index].slice(-3);
  index = (index + 1) % count;
  render();
};
$("back").onclick = () => {
  index = passed.pop();
  render();
};
let pointer;
$("card").onpointerdown = (event) => {
  if (!count || !event.isPrimary) return;
  pointer = { x: event.clientX, y: event.clientY };
  event.currentTarget.setPointerCapture(event.pointerId);
};
$("card").onpointercancel = () => {
  pointer = undefined;
};
$("card").onpointerup = (event) => {
  if (!pointer) return;
  const dx = event.clientX - pointer.x,
    dy = event.clientY - pointer.y;
  pointer = undefined;
  if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy))
    $(dx < 0 ? "next" : "back").click();
};
function reset() {
  deck = undefined;
  revision++;
  count = index = 0;
  passed = [];
  render();
  $("card").textContent = "";
}
$("gender").onchange = $("adult").onchange = $("age").onchange = reset;
$("load").onclick = async () => {
  reset();
  const version = revision;
  if (!$("adult").checked) {
    $("card").textContent = "Confirm you are 18 or older to browse.";
    return;
  }
  try {
    const result = await call("previewEventDeck", {
      adult: true,
      gender: $("gender").value,
      age: $("age").value,
      session,
      campaign: new URLSearchParams(location.search).get("utm_campaign"),
    });
    if (version === revision) {
      count = result.count;
      deck = result.deck;
      render();
    }
  } catch (error) {
    if (version === revision) $("card").textContent = error.message;
  }
};
try {
  const room = await call("getEventRoom", {});
  if (room.cover) {
    $("cover").src = room.cover;
    $("cover").hidden = false;
  }
  document.title = room.title + " · Paire community room";
  document.querySelector("h1").textContent = room.title;
  const date = (value) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: room.timezone,
    }).format(value);
  $("info").textContent = [
    room.category,
    room.venue,
    room.city,
    date(room.start) + " – " + date(room.end),
    room.timezone,
    room.open ? "Room closes " + date(room.closesAt) : "Room closed",
  ].join(" · ");
  document.querySelector("section").hidden = !room.open;
  function checkClosingTime() {
    const remaining = room.closesAt - Date.now();
    if (remaining > 0) {
      setTimeout(checkClosingTime, Math.min(remaining, 2147483647));
      return;
    }
    reset();
    document.querySelector("section").hidden = true;
    $("info").textContent = [
      room.category,
      room.venue,
      room.city,
      "Room closed " + date(room.closesAt),
      room.timezone,
    ].join(" · ");
  }
  if (room.open) checkClosingTime();
  const target = new URL("/app/", location.origin);
  target.searchParams.set("event", id);
  for (const [key, value] of new URLSearchParams(location.search))
    if (/^utm_(source|medium|campaign|content|term)$/.test(key))
      target.searchParams.set(key, value.slice(0, 150));
  $("join").href = target.href;
  $("join").onclick = () => {
    try {
      sessionStorage.setItem(
        "paire.eventIntent",
        JSON.stringify({
          id,
          deck: count ? deck : null,
          slot: index,
          campaign: target.search,
          at: Date.now(),
        }),
      );
    } catch {
      /* The direct URL still opens the intended room. */
    }
  };
} catch (error) {
  $("info").textContent = error.message;
}
