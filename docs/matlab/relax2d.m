function [V, sweeps, residual, history] = relax2d(V, fixed, eps_r, rho, h, tol, maxSweeps)
%RELAX2D  Plain Gauss-Seidel neighbour averaging for Laplace / Poisson in 2-D.
%   [V, sweeps, residual, history] = relax2d(V, fixed, eps_r, rho, h, tol, maxSweeps)
%
%   Solves   div( eps_r * grad V ) = -rho / eps0   on a uniform grid with spacing h.
%   This is, line for line, the same loop as core/relax2d.js in the intro-EMF-lab site,
%   so you can check your numbers against the Sandbox tab.
%
%   V         ny-by-nx initial guess; cells with fixed == true keep their value
%   fixed     ny-by-nx logical: true where the potential is prescribed (conductors,
%             and the outer ring of cells for a grounded box)
%   eps_r     ny-by-nx relative permittivity (ones(ny,nx) for free space)
%   rho       ny-by-nx volume charge density in C/m^3 (zeros for Laplace)
%   h         grid spacing in metres (dx == dy)
%   tol       stop when the largest change in one sweep is below tol (volts)
%   maxSweeps safety cap on the number of sweeps
%
%   history   two columns: [sweep number, max |dV| in that sweep]
%
%   The coefficient on each neighbour is the permittivity at the shared face, taken as
%   the harmonic mean of the two cells, so a dielectric interface is handled correctly.
%   With eps_r = 1 everywhere and rho = 0 the update is just the mean of four neighbours.

eps0 = 8.8541878128e-12;
[ny, nx] = size(V);
h2e0 = h^2 / eps0;
history = zeros(maxSweeps, 2);
residual = Inf;
sweeps = 0;

hm = @(a, b) 2*a.*b ./ (a + b);   % harmonic mean

while sweeps < maxSweeps && residual > tol
    maxd = 0;
    for j = 2:ny-1            % interior cells only; the outer ring is fixed (grounded box)
        for i = 2:nx-1
            if fixed(j, i), continue, end
            ec = eps_r(j, i);
            eE = hm(ec, eps_r(j, i+1));  eW = hm(ec, eps_r(j, i-1));
            eN = hm(ec, eps_r(j+1, i));  eS = hm(ec, eps_r(j-1, i));
            vNew = (eE*V(j, i+1) + eW*V(j, i-1) + eN*V(j+1, i) + eS*V(j-1, i) ...
                    + rho(j, i)*h2e0) / (eE + eW + eN + eS);
            d = abs(vNew - V(j, i));
            if d > maxd, maxd = d; end
            V(j, i) = vNew;   % Gauss-Seidel: use the new value immediately
        end
    end
    sweeps = sweeps + 1;
    residual = maxd;
    history(sweeps, :) = [sweeps, residual];
end
history = history(1:sweeps, :);
end
