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
  }, { rootMargin: '0px 0px -4% 0px', threshold: 0 });
  const SEL = 'main .card, main .glass, main .grid > *, main .tl-item, main .day';
  const SKIP = '.planner aside, .portal-overlay, .chapter-nav, [data-no-reveal], .dock, .nav, .lightbox, .drawer, .mapfly';
  const scan = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>(SEL).forEach((el) => {
      if (el.dataset.revealed || el.closest(SKIP)) return;
      el.dataset.revealed = '1';
      el.classList.add('reveal');
      // Tall panels get a flat fade-up: a 3D tilt on something taller than the screen throws it far off course.
      if (el.offsetHeight > innerHeight * 0.8) el.classList.add('reveal-flat');
      io.observe(el);
    });
    root.querySelectorAll<HTMLElement>('.reveal:not(.in)').forEach((el) => io.observe(el));
  };
  scan(document);
  // Re-scan for new content at most once per frame.
  let queued = 0;
  new MutationObserver(() => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; scan(document); }); }).observe(document.body, { childList: true, subtree: true });
}
