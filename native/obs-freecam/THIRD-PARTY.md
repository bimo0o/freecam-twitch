# Runtime notices

The Windows DLL is built with MinGW-w64 GCC. GCC runtime libraries are linked statically under the GCC Runtime Library Exception; see licenses/GCC-RUNTIME-EXCEPTION and licenses/GPL-3.0. Winpthreads is linked statically; its license and component notices are preserved in licenses/winpthreads-COPYING. MinGW-w64 notices are in licenses/mingw-COPYING.

OBS/libobs and obs-frontend-api are loaded from the user's OBS installation. OBS DLLs are not redistributed in this package. The Freecam native module source itself is GPL-2.0-or-later; see COPYING.

Official notice sources:
- https://github.com/mingw-w64/mingw-w64/blob/master/mingw-w64-libraries/winpthreads/COPYING
- https://github.com/mingw-w64/mingw-w64/blob/master/COPYING
- https://github.com/gcc-mirror/gcc/blob/master/COPYING.RUNTIME
