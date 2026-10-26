/**
 * Site-wide 3D entrance: cards and panels rise in from depth as they scroll into view.
 * Elements get `.reveal` automatically (opt out with data-no-reveal); fixed/sticky UI is skipped.
 */
export function installReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  const SEL = 'main .card, main .glass, main .grid > *, main .tl-item, main .day';
  const SKIP = '.planner aside, .portal-overlay, .chapter-nav, [data-no-reveal], .dock, .nav, .lightbox, .drawer';
  const scan = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
      if (el.dataset.revealed || el.closest(SKIP)) return;
      el.dataset.revealed = '1';
      el.classList.add('reveal');
      io.observe(el);
    });
    root.querySelectorAll<HTMLElement>('.reveal:not(.in)').forEach((el) => io.observe(el));
  };
  scan(document);
  new MutationObserver(() => scan(document)).observe(document.body, { childList: true, subtree: true });
}
