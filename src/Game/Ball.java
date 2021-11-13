package Game;

import java.awt.Point;

public class Ball {

   public Point location;
   public int xVelocity = 0;
   public int yVelocity = 0;

   public static int leftBoundary = -256; // Would be -128 but add 8 for goalie zone
   public static int topBoundary = 254;
   public static int bottomBoundary = -256;
   public static int rightBoundary = 254; // Would be 127 but sub 8 for goalie zone
   
   public int maxYVelocity = 10;
   
   // DEBUG PROPERTIES, DELETE THESE
   public int drawX = 0;
   public int drawY = 0;

   /**
    * Instantiates a new ball at the center position with given velocities
    *
    * @param xVelocity
    * @param yVelocity
    */
   public Ball(int xVelocity, int yVelocity) {
      location = new Point(0, 0);
      this.xVelocity = xVelocity;
      this.yVelocity = yVelocity;
   }
   
   /**
    * Instantiates a new ball at the center position with given velocities
    *
    * @param xVelocity
    * @param yVelocity
    */
   public Ball(double xVelocity, double yVelocity) {
      this((int)xVelocity, (int)yVelocity);
   }
   
   /**
    * Instantiates a new ball based of off another one
    *
    * @param xVelocity
    * @param yVelocity
    */
   public Ball(Ball ball) {
      int xMod = (Math.rint(Math.random()*2) == 1) ? 1 : -1;
      int yMod = (Math.rint(Math.random()*2) == 1) ? 1 : -1;
      this.location = ball.location;
      xVelocity = ball.xVelocity * xMod;
      xVelocity = ball.xVelocity * yMod;
   }

   /**
    * Updates the balls position with its given velocity. If the ball exits a
    * boundary it will then reverse its direction.
    *
    * @param game The current Game
    */
   public void tick(Game game) {
      if (location.x + xVelocity > rightBoundary
              || location.x + xVelocity < leftBoundary) {
         game.processHit(location.x + xVelocity < leftBoundary, location.y, this);
         xVelocity = -xVelocity;
      }
      if (location.y + yVelocity < bottomBoundary
              || location.y + yVelocity > topBoundary) {
         yVelocity = -yVelocity;
      }
      location.x += xVelocity;
      location.y += yVelocity;
   }
   
   @Override
    public String toString() {
        return "x: " + location.x + "y: " + location.y;
    }
}
