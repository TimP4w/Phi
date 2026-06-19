{
  description = "Go + Yarn + go-mockery + make development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs";

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      # mockery v2 (the version `make backend-mocks` targets) ships a
      # golang.org/x/tools whose go/types caps the supported language version at
      # go1.24, so it refuses to parse this module's `go 1.26` directive —
      # recompiling it against a newer toolchain does not lift that cap. This
      # wrapper transiently rewrites the `go` directive down to a version mockery
      # accepts for the duration of a run, then restores go.mod. Mocks are pure Go
      # interface shapes, so the lowered directive does not affect their output.
      mockery = pkgs.writeShellScriptBin "mockery" ''
        set -u
        if [ -f go.mod ] && ${pkgs.gnugrep}/bin/grep -qE '^go 1\.(2[6-9]|[3-9][0-9])' go.mod; then
          cp go.mod .go.mod.mockerybak
          # Restore on any exit; cannot `exec` mockery or this trap never fires.
          trap 'mv .go.mod.mockerybak go.mod' EXIT
          ${pkgs.gnused}/bin/sed -i -E 's/^go [0-9]+\.[0-9]+(\.[0-9]+)?$/go 1.24.0/' go.mod
        fi
        ${pkgs.go-mockery}/bin/mockery "$@"
      '';
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          pkgs.go
          pkgs.yarn
          pkgs.gnumake
          # Wrapper shadows pkgs.go-mockery on PATH (both expose `mockery`); the
          # wrapper invokes the real binary by absolute store path.
          mockery
        ];
        shellHook = ''
          echo "Phi development environment is ready!"
        '';
      };
    };
}
