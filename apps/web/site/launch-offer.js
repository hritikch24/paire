import { LAUNCH_OFFER, OFFER_PRICES, currentPrice, formatInr, offerActive } from "/launch-offer-contract.js";
const paint = () => {
  if (offerActive()) return;
  const replacements = Object.fromEntries(Object.values(OFFER_PRICES).map(p => [formatInr(p.offer), formatInr(p.regular)]));
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walk.nextNode()) nodes.push(walk.currentNode);
  nodes.forEach(node => { if (!node.parentElement?.closest("script,style,[data-launch-offer],[data-offer-plan]")) node.textContent = node.textContent.replace(/₹(?:1,499|799|399|99|49|35)(?![\d,.])/g, value => replacements[value] ?? value).replace(/₹6\.65/g, "₹9.50").replace(/₹4\.44/g, "₹6.34"); });
  document.querySelectorAll("[data-offer-plan]").forEach(node => {
    const plan = node.dataset.offerPlan;
    if (!OFFER_PRICES[plan]) return;
    const detail = node.querySelector("span")?.textContent || "";
    node.replaceChildren(document.createTextNode(formatInr(currentPrice(plan))));
    const span = document.createElement("span"); span.textContent = detail; node.append(span);
  });
  document.querySelectorAll("[data-launch-offer]").forEach(node => { node.textContent = "The 30–31 October offer has ended. Open the app to see current prices. Previously issued orders keep their original quote."; });
};
paint();
if (offerActive()) setTimeout(paint, Math.max(1, LAUNCH_OFFER.endsAt - Date.now() + 50));
