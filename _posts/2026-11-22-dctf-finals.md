---
title: "Pwning in Romania, DefCamp CTF finals"
---

Recently I got to play in the finals for DefCamp CTF with a few
friends, the competition was supposed to be 20 teams of 5 playing a
standard jeopardy-style CTF, but due to unfortunate circumstances,
2 of our teammates could not make it and our backup also got sick.
So there we were, down 2 players, coming to terms with
being quite limited in manpower and joking about being happy
if we werent last place. Luckily, things weren't that bad, we still
tried our best and actually got 8th place, which isn't too bad
considering we were down 2 members.

During the CTF, i focused on pwn which is the category im most
comfortable in, I solved my 1 challenge and then pivoted to helping
a teammate with his challenge, in hindsight i shouldnt have done that
and focused on solving more challenges - After the competition ended
I went back and solved 1 more challenge and it turned out to be really
simple -- Oh well!

## Bob the Builder
Here's the writeup for the challenge i solved during the ctf, i might do another one on `karma`, which
is the challenge i solved after the ctf ended.

We're given a very simple main.c among some other challenge files:
```c
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <stdint.h>

void reads(const char *prompt, char *buf, size_t len) {
  write(1, prompt, strlen(prompt));
  for (size_t i = 0; i < len; i++) {
    if (read(0, buf + i, 1) != 1)
      _exit(1);
    if (buf[i] == '\n') {
      buf[i] = '\0';
      break;
    }
  }
}

unsigned readi(const char *prompt) {
  char buf[0x10] = { 0 };
  reads(prompt, buf, sizeof(buf)-1);
  return (unsigned)atoi(buf);
}

char *note;

int main() {
  unsigned allocs = 0;
  unsigned frees = 0;
  for (size_t i = 0; i < 0x100; i++) {
    switch (readi("> ")) {
      case 1:
        if (allocs >= 24) *(uint64_t *)note = 0x0;
        note = malloc(8);
        reads("data: ", note, 8);
        allocs++;
        break;
      case 2: write(1, note, strlen(note)); write(1, "\n", 1); break;
      case 3:
        free(note);
        break;
      default: _exit(0);
    }
  }
  _exit(0);
}
```
It appears to be a very simple heap exploitation challenge, and we can immediately see that 
we can double free using option 3 repeatedly. Lets try that!

```
kat@ctf ~/c/2/btb> ./hoard
> 1
data: aaabbb
> 3
> 3
free(): double free detected in tcache 2
fish: Job 1, './hoard' terminated by signal SIGABRT (Abort)
```
Well, that sucks. Or does it? Turns out, I wasn't running the challenge properly, we were using glibc's allocator which nowadays is fairly robust against an attack like this, however the challenge actually runs using `LD_PRELOAD=./libhoard.so ./hoard` which replaces the standard glibc allocator with a different one! So after fixing that and running the challenge properly, we get...

```
kat@ctf ~/c/2/btb [SIGINT]> LD_PRELOAD=./libhoard.so ./hoard
> 1
data: aaabbb
> 3
> 3
> 2
p
> 
```
we get... p?

Lets see whats going on. We hook up our debugger and step through the code, I set a breakpoint at the malloc so we can see what we get back

![]({{ '/assets/img/dctf-1.png' | relative_url}})
![]({{ '/assets/img/dctf-2.png' | relative_url}})

So `0x7f3068bc0070` is the ptr returned by malloc, lets have a look around that memory region
![]({{ '/assets/img/dctf-3.png' | relative_url}})
Here we can quite clearly see that `0x70` is where our allocation region begins, while, the memory before that seems to be the the state/header of
the allocator - lets see how the memory changes when we trigger the double free

After inserting aaabbb:
![after inserting aaabbb]({{ '/assets/img/dctf-4.png' | relative_url}})

After freeing once:
![after freeing once]({{ '/assets/img/dctf-5.png' | relative_url}})

After double freeing:
![after double freeing]({{ '/assets/img/dctf-6.png' | relative_url}})

Now it makes a lot more sense why we got `p` earlier when trying to view our note! when we tried to print the string at
`0x7f3068bc0070`, we successfully printed `0x70`, but then the `0x00` terminated our string, we can fix this by making more allocations so the address moves up until its no longer a null-byte:
![]({{ '/assets/img/dctf-7.png' | relative_url}})

That gives us our leak, we now know where we are in the allocator, and we also know where the allocator begins.
Now, how do we go from this to code execution? We just learned where we are in memory, but now we must learn where everyone else is, since ASLR is enabled, the addresses of things are randomized and we dont really have any neighbouring mapped regions that stay at a fixed offset, but luckily we have everything we need already in our allocator memory region. If you recall from earlier, the mysterious pointers in the header of the allocator, some of them point back into memory that belongs to `libhoard`

![]({{ '/assets/img/dctf-8.png' | relative_url}})

Okay, but now -- how do we read those values? we need a read gadget! But, we already have one. Using the double free,
we corrupt the tcache/free list of the allocator, when we go to allocate, it will first return the ptr we just free'd,
and the next thing on the free list is actually overlapping with the memory we just got, so we can do:
```
1. double free,
2. allocate and set contents to be arb pointer
3. allocate again and return an arb pointer 
```
Using this, we can "allocate" right before a value we want to read, then fill our note buffer with 8 characters, so that
we do not have a nul-byte, and then continue reading past our buffer and leak the pointer we want to read, of course we need to be lucky again that the ptr doesnt contain a null byte, but if it does we can simply rerun and get a new gamble, but the odds of that happening are quite low.

After we have a leak to a pointer inside libhoard, we can calculate its offset, and find the base of libhoard, but actually, this doesnt just give us the address of libhoard, it gives us ANY shared library address, including libc. Why? This is because of how the dynamic loader works, it does randomize addresses every time you run a binary, however it does not randomize the offsets, so sequentially loaded libraries will preserve their offsets, for us that means leaking libhoard also leaks libc. At this point we basically won, we can arbitrarily read and write and defeated ASLR, now we can overwrite the hook inside of libc that allowed this challenge to insert a custom allocator in the first place, so when we call `free()` it wont go to libhoards free anymore, but instead to lets say... `system()`! and since
free takes a pointer, and we have a way of returning any pointer, we can free a pointer that points to `/bin/sh\x00`, and when we go to `free(ptr)` it will actually run `system('/bin/sh')`, bingo.

![]({{ '/assets/img/dctf-9.png' | relative_url}})
