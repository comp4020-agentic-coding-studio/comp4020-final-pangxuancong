# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The first time I opened the live logs and played a round, every move I made
appeared in the terminal as a line: which room, which round, which
character, what I did. It felt like magic. Until then the server was
something I could not see; now I could read what it was doing while I played.

## What did this work change about who I want to be as a software developer?

I learned that logs need a format. A line has to be readable at a glance
(`[HR32 SELECT] Chicken#b421 seat:claim`) and still carry the full details
after it, and everyone has to be named the same way every time, or I cannot
follow one person through the log. I also learned that a log has to give
enough information. "Bomb" alone tells me nothing; "Big Dog#2a39 bombed the
spring placed by Chicken#690f" tells me who did what to whom, and a refused
action should say why it was refused. I want to write logs that someone
else, or me in a month, can actually use to find out what happened.
