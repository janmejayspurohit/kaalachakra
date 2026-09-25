{
  # Two targets on purpose.
  #
  # `swisseph_core` compiles Astrodienst's C exactly as shipped, with its
  # cosmetic warnings suppressed at the BUILD level rather than fixed by
  # editing the sources. Every upstream warning is benign - dead locals, an
  # unused parameter, indentation, one signed/unsigned compare, one partially
  # initialised struct - and none indicates a numerical defect. sweph.c alone
  # is 270 KB of numerically validated ephemeris code; hand-editing it to tidy
  # build output risks a silent arithmetic error our tests would not catch.
  # Keeping vendor/ byte-identical to upstream also lets us diff cleanly
  # against a future Astrodienst release.
  #
  # `swisseph` is our own binding, and is held to -Wall -Wextra -Werror. Our
  # code gets no such indulgence.
  "targets": [
    {
      "target_name": "swisseph_core",
      "type": "static_library",
      "standalone_static_library": 1,
      "sources": [
        "vendor/swecl.c", "vendor/swedate.c", "vendor/swehel.c",
        "vendor/swehouse.c", "vendor/swejpl.c", "vendor/swemmoon.c",
        "vendor/swemplan.c", "vendor/sweph.c", "vendor/swephlib.c"
      ],
      "include_dirs": ["vendor"],
      "cflags": [
        "-O2", "-fPIC",
        "-Wno-unused-but-set-variable", "-Wno-unused-but-set-parameter",
        "-Wno-unused-parameter", "-Wno-misleading-indentation",
        "-Wno-sign-compare", "-Wno-missing-field-initializers",
        "-Wno-unused-variable", "-Wno-unused-function"
      ],
      "cflags_c": ["-std=c99"],
      "xcode_settings": {
        "GCC_C_LANGUAGE_STANDARD": "c99",
        "MACOSX_DEPLOYMENT_TARGET": "11.0",
        "GCC_WARN_UNUSED_VARIABLE": "NO",
        "GCC_WARN_UNUSED_PARAMETER": "NO",
        "OTHER_CFLAGS": [
          "-O2",
          "-Wno-unused-but-set-variable", "-Wno-unused-but-set-parameter",
          "-Wno-unused-parameter", "-Wno-misleading-indentation",
          "-Wno-sign-compare", "-Wno-missing-field-initializers",
          "-Wno-unused-variable", "-Wno-unused-function"
        ]
      },
      "msvs_settings": {
        "VCCLCompilerTool": { "Optimization": 2, "WarningLevel": 1 }
      },
      "direct_dependent_settings": { "include_dirs": ["vendor"] }
    },
    {
      "target_name": "swisseph",
      "type": "loadable_module",
      "product_extension": "node",
      "sources": ["src/binding.c"],
      "dependencies": ["swisseph_core"],
      "include_dirs": ["vendor"],
      "defines": ["NAPI_VERSION=8"],
      "cflags": ["-O2", "-fPIC", "-Wall", "-Wextra", "-Werror"],
      "cflags_c": ["-std=c99"],
      "xcode_settings": {
        "GCC_C_LANGUAGE_STANDARD": "c99",
        "MACOSX_DEPLOYMENT_TARGET": "11.0",
        "OTHER_CFLAGS": ["-O2", "-Wall", "-Wextra", "-Werror"]
      },
      "msvs_settings": {
        "VCCLCompilerTool": { "Optimization": 2, "WarningLevel": 4 }
      }
    }
  ]
}
