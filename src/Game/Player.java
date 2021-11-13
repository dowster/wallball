package Game;

/**
 * An abstract class to manage players. It holds the basic components such as
 * paddle properties, movement methods, and the players ID. It can be 
 * extended to make players such as a CPU player, a human player, or even a
 * network controlled player.
 * 
 * @author dowster
 */
public abstract class Player {
   
   /**
    * The ID of the player, with 1 usually being left and 2 usually being 
    * right.
    */
   protected int playerID = -1;
   
   /**
    * Vertical location of the paddle. 0 is on the horizon
    * Top is 127
    * Bottom is -128
    */
   protected int paddleLocation = 0;
   
   /**
    * The bottom boundary for the paddles
    */
   protected final int bottomLocation = -256;
   /**
    * The top boundary for the paddles 
    */
   protected final int topLocation = 254;   
   /**
    * The height of the paddles. This is not final because it may change
    * with power-ups.
    */
   protected int paddleHeight = 50;

   /**
    * The thickness of the player's paddle, in pixels.
    */
   protected int paddleThickness = 10;
   /**
    * The distance the paddles can move with every call to move up or down.
    */
   private int paddleMovementDistance = 5;
   /**
    * The number of points to add when addPoint() is called. 
    */
   private int pointCoefficient = 1;
   /**
    * The number of points the player currently has
    */
   private int points = 0;
   /**
    * The players life counter, started at 10 lives per player
    */
   private int lifes = 10;
   
   
   Player(int playerID)
   {
      this.playerID = playerID;
   }
   
   /**
    * Gets the player's ID which is set during instantiation. 
    * @return playerID
    */
   public int getPlayerID()
   {
      return playerID;
   }
   
   /**
    * Gets the player's ID which is set during instantiation. 
    * @return playerID
    */
   public int getPlayerLives()
   {
      return lifes;
   }
   
   /**
    * Gets the player's ID which is set during instantiation. 
    * @return playerID
    */
   public void addPlayerLife()
   {
      if (lifes < 15)
         lifes++;
   }
   
   /**
    * Moves the paddle up by the distance set above. If the paddle would go
    * above topLocation then the paddle is set to topLocation.
    */
   protected void movePaddleUp()
   {
      if(paddleLocation + paddleHeight / 2 + paddleMovementDistance < topLocation)
         paddleLocation += paddleMovementDistance;
      else
         paddleLocation = topLocation - paddleHeight / 2;
   }
   
   /**
    * Moves the paddle down by the distance set above. If the paddle would go
    * below bottomLocation then the paddle is set to bottomLocation.
    */
   protected void movePaddleDown()
   {
      if(paddleLocation - paddleHeight / 2 - paddleMovementDistance > bottomLocation)
         paddleLocation -= paddleMovementDistance;
      else
         paddleLocation = bottomLocation + paddleHeight / 2;
   }
   
   /**
    * The method to execute every thread tick. For HumanPlayer this should be
    * a simple move up / move down. For CPU player this will have to 
    * calculate which direction to move to. 
    * @param game The current game object.
    */
   
   public abstract void tick(Game game);

   /**
    * Adds the number of points as specified in pointCoefficient.
    */
   public void addPoint()
   {
      points += pointCoefficient;
   }
   /**
    * Sets the players point coefficient to the value provided, given it is
    * greater than 0
    * @param pointCoefficient The new coefficient to use
   */
   public void setPointCoefficient(int pointCoefficient)
   {
      if(pointCoefficient > 0)
         this.pointCoefficient = pointCoefficient;
   }

   /**
    * Decrements one life from the player
    */
   public void decLife()
   {
      lifes--;
   }
   
   /**
    * returns the points of the player
    */
   public int getPoints()
   {
      return points;
   }
   
   /**
    * Gets the current logical height of the paddle.
    * @return The current logical height of the paddle.
    */
   public int getPaddleHeight()
   {
      return paddleHeight;
   }

   /**
    * Sets the logical heigh the paddle.
    * @param paddleHeight The logical height to set to.
    */
   public void setPaddleHeight(int paddleHeight)
   {
      this.paddleHeight = paddleHeight;
   }
   
   /**
    *
    * @return
    */
   public int getPaddleMovementDistance()
   {
      return paddleMovementDistance;
   }

   public void setPaddleMovementDistance(int paddleMovementDistance)
   {
      this.paddleMovementDistance = paddleMovementDistance;
   }
}
