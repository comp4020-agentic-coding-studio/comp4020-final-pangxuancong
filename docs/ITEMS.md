# Placeable items

Every normal item must meaningfully change player movement. No decorative
placeables. Keep the pool small.

| Item | Purpose | Behaviour | First parameters |
|---|---|---|---|
| Platform | make or obstruct standable space | static solid collider; bridges, or blocks a jump arc | position; orientation if supported. No resizing for the MVP |
| Spring | change velocity | contact with its active face sets `velocity.y = springLaunchVelocity`, optionally keeping some horizontal speed | position; orientation later. One consistent, readable bounce, no power slider at first |
| Spike | lethal area | overlap: RUNNING → DEAD. Always visually obvious, no gore | position |
| Fan | continuous push | a 1×1 fan blowing along one of four directions; inside its 4-cell zone a player is accelerated that way. Only the fan itself occupies space; the zone may cross anything | position; R turns the direction |
| Moving Platform | timing | a 2-cell plank sliding back and forth along a track (5×1 horizontal, 2×4 vertical) on a fixed 6 s cycle (top speed about 1.6 cells a second) from the start of the run; the whole track is its footprint | position; R switches axis |
| Demolition Bomb | remove one earlier object | BUILD-phase action, see below; never stays in the level | target |

## Demolition Bomb

Deadlock recovery and sabotage. Not a RUN-phase explosive.

1. The player selects the Bomb; destructible player-placed objects become
   targetable.
2. They choose one; the preview clearly identifies it.
3. They confirm; the server validates.
4. The target is deleted, the Bomb is consumed, the build action is used
   (build state PLACED).

Can destroy: Platform, Spring, Spike, Fan, Moving Platform, and any future
destructible player-placed item, whoever placed it.

Cannot destroy: base level geometry, START, GOAL/flag, world boundaries,
system-required colliders. (Bombs never persist, so there is no Bomb to
target.)

The system never decides an obstruction is bad and should go. Players decide;
the Bomb only gives them the power.

## Placement validity

Gameplay-impossible arrangements are allowed. Reject only when the placement:

- is outside world/build bounds;
- intersects the protected START volume;
- overlaps the protected GOAL trigger;
- creates invalid collider geometry;
- breaks a basic item-specific constraint.

Never run pathfinding to keep the level completable.

## Kill credit

A Spike remembers who placed it (their player id). When another player dies
on it, that placer scores +0.2 (`docs/GAME_LOOP.md`). The client reports
which spike killed it; the server checks the spike exists. Items carried
into an archived game keep their placer.

## Shared ownership

Once committed, an item belongs to the level, not its creator. Nobody can move
it in a later round. Later interaction is only through new placements,
demolition, or a mechanic designed for it. This keeps each build choice
consequential.

## Course fixtures

A course may come with its own pieces (a fan on The Tower, a swing on The
Swing). They use the same item types and behaviour, but belong to the level
definition, not to anyone: they cannot be demolished, cannot be built over,
and a death on one credits nobody.
