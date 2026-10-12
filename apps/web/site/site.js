const vibes = {
  slow: { title: 'Slow mornings.<br>Long conversations.', detail: 'A café, a walk, and nowhere to rush.', tags: ['Easygoing', 'Quality time', 'Chai person'] },
  music: { title: 'Same chorus.<br>One more encore.', detail: 'Live music, a shared playlist, and momos after.', tags: ['Live music', 'Spontaneous', 'Food trails'] },
  curious: { title: 'A good book.<br>A better detour.', detail: 'Swap recommendations. Wander a little longer.', tags: ['Curiosity', 'Bookshops', 'Thoughtful chats'] }
};
document.querySelectorAll('[data-vibe]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-vibe]').forEach(choice => choice.setAttribute('aria-pressed', String(choice === button)));
  const vibe = vibes[button.dataset.vibe];
  document.querySelector('#vibe-title').innerHTML = vibe.title;
  document.querySelector('#vibe-detail').textContent = vibe.detail;
  document.querySelector('#vibe-tags').replaceChildren(...vibe.tags.map(tag => { const node = document.createElement('span'); node.textContent = tag; return node; }));
}));

// Garba Nights is a Navratri edition: mark tonight, fade past nights, and hide it all after Dussehra (India time).
(() => {
  const section = document.querySelector('[data-garba-until]');
  if (!section) return;
  const today = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
  if (today > section.dataset.garbaUntil) {
    section.hidden = true;
    document.querySelectorAll('a[href="#garba"], [data-garba-item]').forEach(node => node.remove());
    return;
  }
  section.querySelectorAll('[data-night]').forEach(night => {
    if (night.dataset.night === today) night.classList.add('tonight');
    else if (night.dataset.night < today) night.classList.add('past');
  });
})();
