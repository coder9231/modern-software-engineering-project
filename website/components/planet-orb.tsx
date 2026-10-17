import "./planet-orb.css";

export type PlanetKind = "data" | "logic" | "build" | "origin" | "archive";

/** Procedural, asset-free spheres shared by the star map and its opening shot. */
export function PlanetOrb({ kind, className = "" }: { kind: PlanetKind; className?: string }) {
  return (
    <span className={`se-planet se-planet--${kind} ${className}`} aria-hidden="true">
      <span className="se-planet__glow" />
      {(kind === "logic" || kind === "data") && <span className="se-planet__ring se-planet__ring--back" />}
      <span className="se-planet__sphere">
        <span className="se-planet__terrain" />
        <span className="se-planet__cloud" />
        <span className="se-planet__shade" />
      </span>
      {(kind === "logic" || kind === "data") && <span className="se-planet__ring se-planet__ring--front" />}
      {kind === "build" && <span className="se-planet__satellite" />}
    </span>
  );
}
