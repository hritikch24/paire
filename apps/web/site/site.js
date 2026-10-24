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

// Dated campaigns (Diwali Together) disappear after their last day (India time).
(() => {
  const today = new Date(Date.now() + 330 * 60 * 1000).toISOString().slice(0, 10);
  document.querySelectorAll('[data-campaign-until]').forEach(section => {
    if (today <= section.dataset.campaignUntil) return;
    section.hidden = true;
    const id = section.id;
    if (id) document.querySelectorAll(`a[href="#${id}"]`).forEach(node => node.remove());
    document.querySelectorAll('[data-campaign-item]').forEach(node => node.remove());
  });
})();
