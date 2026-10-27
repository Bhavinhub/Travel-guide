/**
 * Hero photograph that never looks wrong: a wide, high-resolution photo fills the banner;
 * a portrait or small photo (e.g. a person's portrait from Wikipedia) is shown whole and
 * sharp on the right, over a soft blurred fill of itself — never blown up or cropped to a
 * nose. Faces in portraits are framed from the top.
 */
export function HeroImage({ src, srcSet, alt, w, h }: { src: string; srcSet?: string; alt: string; w?: number; h?: number }) {
  const known = !!(w && h);
  const portrait = known && h! > w! * 0.95;
  const small = known && w! < 1600;
  if (!known || (!portrait && !small)) {
    return <img className="hero-img" src={src} srcSet={srcSet} sizes="100vw" alt={alt} referrerPolicy="no-referrer" style={{ objectPosition: 'center 38%' }} />;
  }
  return (
    <div className="hero-fit">
      <img className="hero-fill" src={src} alt="" aria-hidden referrerPolicy="no-referrer" />
      <img className={`hero-whole${portrait ? ' is-portrait' : ''}`} src={src} srcSet={srcSet} alt={alt} referrerPolicy="no-referrer" />
    </div>
  );
}
