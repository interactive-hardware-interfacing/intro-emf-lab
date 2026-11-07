% LAB2_TWO_RODS_DEMO  Two oppositely charged rods with relax2d, plus the analytic check.
% Matches the Sandbox tab preset "Two round rods" with the same d, a, V0 and grid.
% Run this, then open the Sandbox with the same numbers and compare the cutline.

clear; clc;

% ---- geometry (metres) and grid ------------------------------------------------------
L  = 1;            % box is [-L, L]^2, walls grounded (V = 0)
n  = 129;          % grid points per side (odd keeps a point on the axis)
d  = 0.4;          % half separation of the rod centres
a  = 0.12;         % rod radius
V0 = 1;            % right rod at +V0, left rod at -V0
tol = 1e-5;        % stop when max |dV| per sweep is below this

x = linspace(-L, L, n);  y = linspace(-L, L, n);
h = x(2) - x(1);
[X, Y] = meshgrid(x, y);          % X(j,i) = x(i), Y(j,i) = y(j)

V     = zeros(n, n);
fixed = false(n, n);
fixed([1 end], :) = true;  fixed(:, [1 end]) = true;     % grounded box
inRight = (X - d).^2 + Y.^2 <= a^2;
inLeft  = (X + d).^2 + Y.^2 <= a^2;
V(inRight) = +V0;  fixed(inRight) = true;
V(inLeft)  = -V0;  fixed(inLeft)  = true;
eps_r = ones(n, n);
rho   = zeros(n, n);

% ---- solve, showing convergence --------------------------------------------------------
[V, sweeps, residual, history] = relax2d(V, fixed, eps_r, rho, h, tol, 200000);
fprintf('converged in %d sweeps, final max |dV| = %.3e V\n', sweeps, residual);

[Ex, Ey] = gradient(-V, h, h);     % E = -grad V

figure(1); clf;
subplot(1,2,1); contourf(X, Y, V, 30, 'LineColor', 'none'); axis equal tight; colorbar;
title('Potential V (numerical)'); xlabel('x (m)'); ylabel('y (m)');
subplot(1,2,2); s = 4; quiver(X(1:s:end,1:s:end), Y(1:s:end,1:s:end), Ex(1:s:end,1:s:end), Ey(1:s:end,1:s:end));
axis equal tight; title('E = -grad V'); xlabel('x (m)'); ylabel('y (m)');

figure(2); clf; semilogy(history(:,1), history(:,2)); grid on;
xlabel('sweep'); ylabel('max |\DeltaV| (V)'); title('Convergence of the neighbour average');

% ---- analytic comparison along the x axis ----------------------------------------------
% Two line charges +-lambda at (+-d, 0). Choose lambda so the right rod surface sits at +V0:
%   V_rod = (lambda / 2 pi eps0) * ln((2d - a)/a)
eps0 = 8.8541878128e-12;
lambda = 2*pi*eps0*V0 / log((2*d - a)/a);
Vline = @(xx, yy) -(lambda/(2*pi*eps0)) * log(hypot(xx - d, yy)) ...
                  +(lambda/(2*pi*eps0)) * log(hypot(xx + d, yy));
jmid = (n + 1)/2;
xa = x(abs(x) < d - a | abs(x) > d + a);        % outside the rods only
figure(3); clf;
plot(x, V(jmid, :), 'b-', xa, Vline(xa, 0), 'r--'); grid on;
xlabel('x (m)'); ylabel('V (V)'); legend('numerical (relax2d)', 'analytic line charges');
title('Cutline along y = 0');
% Note: the analytic model assumes isolated rods in infinite space; the grounded box and
% the finite rod radius make the two curves differ near the walls and near the rods.
