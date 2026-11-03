import type { Business } from '../lib/calc'

/* Flat, geometric scene illustrations. Placeholders for commissioned regional artwork. */

const C = {
  teal: '#B34A1D',
  tealSoft: '#F6D9C4',
  marigold: '#E89B2D',
  clay: '#B4532A',
  wood: '#8A5A3B',
  woodLight: '#B07B55',
  leaf: '#2F7D32',
  leafLight: '#6FAE4B',
  aubergine: '#5B3A6B',
  cream: '#FFF8EE',
  ground: '#E9DCCB',
  steel: '#9AA5A8',
  tea: '#C07A3A',
}

function Awning({ y = 18, color = C.teal }: { y?: number; color?: string }) {
  const stripes = Array.from({ length: 8 })
  return (
    <g>
      {stripes.map((_, i) => (
        <rect key={i} x={40 + i * 30} y={y} width={30} height={22} fill={i % 2 ? C.cream : color} />
      ))}
      {stripes.map((_, i) => (
        <path key={`s${i}`} d={`M${40 + i * 30} ${y + 22} q15 12 30 0`} fill={i % 2 ? C.cream : color} />
      ))}
    </g>
  )
}

export function VegetableStall() {
  return (
    <svg viewBox="0 0 320 170" role="img" aria-label="Vegetable stall" className="w-full h-auto">
      <rect x="0" y="150" width="320" height="20" fill={C.ground} />
      <rect x="44" y="40" width="6" height="110" fill={C.wood} />
      <rect x="270" y="40" width="6" height="110" fill={C.wood} />
      <Awning />
      <rect x="36" y="104" width="248" height="14" rx="3" fill={C.woodLight} />
      <rect x="50" y="118" width="220" height="22" fill={C.wood} />
      <circle cx="80" cy="150" r="10" fill="#4A3426" />
      <circle cx="240" cy="150" r="10" fill="#4A3426" />
      {/* baskets */}
      <path d="M58 104 h56 l-6 -18 h-44z" fill={C.woodLight} />
      {[66, 78, 90, 102, 72, 84, 96].map((x, i) => (
        <circle key={i} cx={x} cy={i < 4 ? 82 : 74} r="7" fill={C.clay} />
      ))}
      <path d="M132 104 h56 l-6 -18 h-44z" fill={C.woodLight} />
      {[140, 152, 164, 176].map((x, i) => (
        <path key={i} d={`M${x} 88 q4 -22 10 -20 q2 14 -6 22z`} fill={i % 2 ? C.leaf : C.leafLight} />
      ))}
      <path d="M206 104 h56 l-6 -18 h-44z" fill={C.woodLight} />
      {[214, 230, 246].map((x, i) => (
        <ellipse key={i} cx={x + 6} cy="80" rx="8" ry="12" transform={`rotate(-20 ${x + 6} 80)`} fill={C.aubergine} />
      ))}
      {/* price board */}
      <rect x="136" y="48" width="48" height="26" rx="3" fill={C.cream} stroke={C.wood} strokeWidth="2" />
      <text x="160" y="66" textAnchor="middle" fontSize="13" fontWeight="700" fill={C.teal}>₹</text>
    </svg>
  )
}

export function TeaStall() {
  return (
    <svg viewBox="0 0 320 170" role="img" aria-label="Tea stall" className="w-full h-auto">
      <rect x="0" y="150" width="320" height="20" fill={C.ground} />
      <rect x="44" y="40" width="6" height="110" fill={C.wood} />
      <rect x="270" y="40" width="6" height="110" fill={C.wood} />
      <Awning color={C.marigold} />
      <rect x="60" y="100" width="200" height="50" fill={C.woodLight} />
      <rect x="54" y="94" width="212" height="10" rx="3" fill={C.wood} />
      {/* stove + kettle */}
      <rect x="76" y="80" width="54" height="14" rx="2" fill="#3C3C3C" />
      <path d="M86 80 q0 -26 22 -26 q22 0 22 26z" fill={C.steel} />
      <path d="M130 66 l18 -8 l2 6 l-16 8z" fill={C.steel} />
      <rect x="100" y="48" width="16" height="6" rx="2" fill={C.steel} />
      <path d="M150 50 q4 -8 0 -16 M158 52 q4 -8 0 -16" stroke={C.steel} strokeWidth="2" fill="none" />
      {/* glasses */}
      {[176, 196, 216, 236].map((x) => (
        <g key={x}>
          <path d={`M${x} 72 h14 l-2 22 h-10z`} fill={C.cream} stroke={C.steel} strokeWidth="1.5" />
          <path d={`M${x + 1} 78 h12 l-1.5 15 h-9z`} fill={C.tea} />
        </g>
      ))}
      {/* biscuit jars */}
      <rect x="180" y="112" width="26" height="30" rx="4" fill={C.tealSoft} />
      <rect x="214" y="112" width="26" height="30" rx="4" fill={C.tealSoft} />
      {[188, 198, 222, 232].map((x) => (
        <circle key={x} cx={x} cy="128" r="4" fill={C.marigold} />
      ))}
      <rect x="20" y="132" width="34" height="8" rx="2" fill={C.wood} />
      <rect x="24" y="140" width="4" height="10" fill={C.wood} />
      <rect x="46" y="140" width="4" height="10" fill={C.wood} />
    </svg>
  )
}

export function GroceryShop() {
  return (
    <svg viewBox="0 0 320 170" role="img" aria-label="Grocery shop" className="w-full h-auto">
      <rect x="0" y="150" width="320" height="20" fill={C.ground} />
      <rect x="30" y="20" width="260" height="130" fill="#F3E7D7" />
      <rect x="30" y="8" width="260" height="22" rx="3" fill={C.teal} />
      <rect x="140" y="13" width="40" height="12" rx="2" fill={C.cream} />
      {/* shelves */}
      {[52, 82].map((y) => (
        <rect key={y} x="44" y={y} width="232" height="5" fill={C.wood} />
      ))}
      {[50, 72, 94, 116, 138, 160, 182, 204, 226, 248].map((x, i) => (
        <rect key={`a${x}`} x={x} y={36} width="16" height="16" rx="2" fill={[C.marigold, C.clay, C.leaf, C.tealSoft][i % 4]} />
      ))}
      {[50, 74, 98, 122, 146, 170, 194, 218, 242].map((x, i) => (
        <g key={`b${x}`}>
          <rect x={x} y={62} width="18" height="20" rx="4" fill={[C.tealSoft, C.cream, '#E7C9A0'][i % 3]} stroke={C.steel} />
          <rect x={x + 3} y={58} width="12" height="5" rx="1" fill={C.clay} />
        </g>
      ))}
      {/* counter + sacks */}
      <rect x="40" y="104" width="240" height="46" fill={C.woodLight} />
      <rect x="36" y="98" width="248" height="8" rx="2" fill={C.wood} />
      <path d="M60 104 q-6 -16 10 -20 h20 q16 4 10 20z" fill="#E7C9A0" />
      <path d="M224 104 q-6 -16 10 -20 h20 q16 4 10 20z" fill="#E7C9A0" />
      <rect x="140" y="86" width="40" height="12" rx="2" fill={C.steel} />
      <rect x="156" y="78" width="8" height="8" fill={C.steel} />
    </svg>
  )
}

export function StallIllustration({ business }: { business: Business }) {
  if (business === 'tea') return <TeaStall />
  if (business === 'grocery') return <GroceryShop />
  return <VegetableStall />
}

/** Rupee note motif for amounts. */
export function NoteIcon({ className = 'w-7 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 18" className={className} aria-hidden>
      <rect x="1" y="1" width="26" height="16" rx="2" fill="#FCE9DC" stroke="#B34A1D" strokeWidth="1.5" />
      <circle cx="14" cy="9" r="4" fill="none" stroke="#B34A1D" strokeWidth="1.5" />
    </svg>
  )
}
