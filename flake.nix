{
  description = "Go + Yarn + go-mockery + make development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          pkgs.go
          pkgs.yarn
          pkgs.gnumake
          pkgs.go-mockery
        ];
        shellHook = ''
          echo "Phi development environment is ready!"
        '';
      };
    };
}
