package Game;

import Windows.MainMenu;

public class CPUPlayer extends Player {
   /**
   difficulty of computer players (0-5); 
   */
   final static int[] diffChance =    {  40 ,  35 ,  30 ,  10 ,   5 ,   2};
   final static int[] diffDistDelay = { 100 , 120 , 130 , 190 , 220 , 240};
   
   //Distance at which the paddle will stop moving
   private final int STOP_MOVING_DISTANCE = 15;
   
   public CPUPlayer(int playerID)
   {
      super(playerID);
   }

   @Override
   public void tick(Game game)
   {
      
      int x = (playerID == 1) ? Ball.leftBoundary : Ball.rightBoundary; 
      Ball b = game.getClosestBall(playerID, x, paddleLocation);
      if (shouldMove(b, x))
          moveToBall(b);
   }
   
   private boolean shouldMove(Ball b, int x)
   {
      //sets location based on if left or right player
      return 
            (Math.abs((b.location.x - x)) < 
            diffDistDelay[MainMenu.difficulty] || 
            Math.random() * 100 < diffChance[MainMenu.difficulty]) &&
            (Math.abs((b.location.x - x)) > STOP_MOVING_DISTANCE);
            
            
   }
   
   public void moveToBall(Ball ball)
   {
      float yDistance = Math.abs(ball.location.y - paddleLocation);
      if (yDistance > 5)
      {
      if (ball.location.y > paddleLocation )
         movePaddleUp();
      else
         movePaddleDown();
      }
   }
   
   
}
