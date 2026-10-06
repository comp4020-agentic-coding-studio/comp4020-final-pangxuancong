# Placeable items

Every normal item must meaningfully change player movement. No decorative
placeables. Keep the pool small.

| Item | Purpose | Behaviour | First parameters |
|---|---|---|---|
| Platform | make or obstruct standable space | static solid collider; bridges, or blocks a jump arc | position; orientation if supported. No resizing for the MVP |
| Spring | change velocity | contact with its active face sets `velocity.y = springLaunchVelocity`, optionally keeping some horizontal speed | position; orientation later. One consistent, readable bounce, no power slider at first |
| Spike | lethal area | overlap: RUNNING → DEAD. Always visually obvious, no gore | position |
| Fan | continuous push | while inside its zone, apply directional acceleration; zone shown subtly while relevant | position, direction; strength later |
| Moving Platform | timing | solid platform on one deterministic axis (horizontal or vertical) | position, axis. No path editor |
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

## Shared ownership

Once committed, an item belongs to the level, not its creator. Nobody can move
it in a later round. Later interaction is only through new placements,
demolition, or a mechanic designed for it. This keeps each build choice
consequential.
