{
  description = "Go + Yarn + go-mockery + make development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs";

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      # replace supported go version in mockery to 1.26
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
          mockery
        ];
        shellHook = ''
          echo "Phi development environment is ready!"
        '';
      };
    };
}
