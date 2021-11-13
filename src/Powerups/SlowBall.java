/**
To change this license header, choose License Headers in Project Properties.
To change this template file, choose Tools | Templates
and open the template in the editor.
*/

package Powerups;

import Game.Ball;
import Game.Game;
import Game.PowerUp;
import java.awt.Graphics;
import java.awt.Point;

/**
 
 @author schmidmichae
 */
public class SlowBall extends PowerUp 
{

   public SlowBall(Point location)
   {
      this.location = new Point(location);
      icon = SlowBall.class.getResource("/res/powerupImages/SlowBall.png");
   }
   
   @Override
   public void tick(Game game)
   {
     super.tick(game);   
   }

   @Override
   public void init(Game game)
   {
      for(Ball ball : game.balls)
      {
         ball.xVelocity *= .8;
      }
   }

   @Override
   public void end(Game game)
   {
      for(Ball ball : game.balls)
      {
         ball.xVelocity *= 1.2;
      }
   }

   @Override
   public void draw(Game game, Graphics w)
   {

   }

}
